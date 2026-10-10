---
id: delivery.zero-downtime-deploy
status: implementing
depends_on: []
implements: ../../specs-business/delivery/a-release-never-drops-a-request.business.md
governed_by: [R-027, R-028]
---

# delivery.zero-downtime-deploy

> Linear: PAD-588 (PAD-571 speed study, cause 4; item 0.4 of the 2026-10-01 infrastructure
> study). Drafted 2026-10-10 by Session E (wave 14). Two halves: the scheduler-leadership half
> (rules 1–3, backend, built first) and the rollout half (rules 4–8, deploy workflows and a host
> nginx change the owner applies).

### Intent
A deploy starts the new API container beside the old one, waits until it answers `/healthz`, and
only then stops the old one. Host nginx sends `/api` to whichever of two loopback ports answers.
Because both containers share the Postgres job store for those seconds, only one process may run
APScheduler: leadership is a Postgres advisory lock, and the startup reschedule moves off
gunicorn's boot path into the leadership thread.

### Surfaces
- `backend/padel_app/scheduler_leadership.py` (new), `backend/padel_app/scheduler.py`
  (`init_scheduler`, `use_scheduler_leadership`, `_start_scheduler_leadership`).
- Rollout half: `backend/scripts/rollout.sh` (new, scp'd by the deploys), `deploy-prod.yaml`,
  `deploy-staging.yaml`, `infra/nginx/conf.d/levapp-api-upstream.conf` (new) and the `levapp` /
  `levapp-staging` vhosts (owner applies on the VM).
- Web, mobile — no change.

### Rules

1. **One scheduler leader per database.** Outside TEST_MODE and the PAD-610 E2E hold, every API
   process starts APScheduler **paused** and runs a leadership thread. The thread takes
   `pg_try_advisory_lock(SCHEDULER_LOCK_KEY)` on a dedicated, unpooled connection; the holder runs
   the startup reschedule, then resumes its scheduler. `SCHEDULER_LEADERSHIP=off` disables it
   (single-process escape hatch).
2. **Leadership follows the session.** The holder pings its connection every 5 s. When the session
   dies (Postgres restarted, the container stopping) the lock is gone: the holder pauses its
   scheduler and retries; the other process takes the lock within one interval of the old
   session ending. A failing reschedule gives the lock back and retries.
3. **The reschedule is off the boot path.** gunicorn accepts requests while the leadership thread
   re-arms jobs; `/api/app/healthz` does not wait for it.
4. **Start before stop.** (rollout half) The deploy starts the new container as `<name>_next` on
   the idle loopback port of the pair (prod 5000/5002, staging 5100/5102), polls
   `http://127.0.0.1:<port>/api/app/healthz` until 200 (timeout 120 s; on timeout the new one is
   removed and the old one keeps serving), then stops the old container with `docker stop -t 10`,
   removes it and renames `<name>_next` to `<name>`. Container names stay stable for every other
   script (sync, runbooks, `rollback_to`).
5. **nginx tries both ports.** `/api` (and the events and register locations) proxy to `upstream
   levapp_api { server 127.0.0.1:5000; server 127.0.0.1:5002; }` with `proxy_next_upstream error
   timeout`. A refused connection is retried on the other port; nginx retries even a POST in that
   case because no byte of the request reached the dead port.
6. **The rollout gates itself on the host.** When the host nginx has no `levapp_api` upstream, or
   no enabled vhost proxies to it (the owner has not applied rule 5 yet), the deploy falls back to
   today's stop-then-start on the first port, so merging the workflow can never break a deploy.
   Every vhost that reaches the API moves to the upstream: `levapp`, `levapp-admin`,
   `padellevelup` (prod) and `levapp-staging`, `levapp-admin-staging` (staging).
7. **Migrations must work with the previous release's code.** The new container's entrypoint
   migrates while the old one still serves. A migration the old code cannot run against (a dropped
   or renamed column it reads) is deployed with the `workflow_dispatch` choice `rollout:
   stop-first`, which is today's stop-then-start.
8. **Workers stay at one.** Each container keeps gunicorn `--workers 1` (R-027). During the few
   seconds of overlap two processes serve; an SSE event published by one does not reach a stream
   attached to the other until that stream reconnects (the old container stopping closes it).

### Acceptance Criteria

#### Only the lock holder runs the scheduler (rules 1, 2)
- **Given** two processes competing for the lock
- **When** the first holds it
- **Then** the second keeps its scheduler paused; **and when** the first's session ends **then**
  the second takes the lock and resumes, with no explicit unlock

#### A Postgres restart pauses and reacquires (rule 2)
- **Given** the holder's connection fails on a ping
- **When** the next step runs **Then** the scheduler is paused, and once the database answers again
  a new connection takes the lock and the scheduler resumes

#### Boot does not reschedule (rules 1, 3)
- **Given** a production boot (not TEST_MODE, not held)
- **When** `init_scheduler` runs
- **Then** the scheduler starts paused, no reschedule runs, and the leadership thread's acquire runs
  the reschedule and then resumes

#### The new container answers before the old one stops (rule 4)
- **Given** `padelapp` live on 5000 and the upstream applied
- **When** `rollout.sh` runs
- **Then** `padelapp_next` starts on 5002, answers `/healthz`, and only then is `padelapp` stopped;
  `padelapp_next` is renamed `padelapp`; the next deploy goes back to 5000

#### A bad release never takes the old one down (rule 4)
- **Given** a new container that never answers, or restarts
- **When** `rollout.sh` runs **Then** it is removed, the old container was never stopped, and the
  deploy fails with the new container's log

#### No upstream on the host, no rolling (rule 6)
- **Given** no upstream file, or no enabled vhost proxying to it
- **When** `rollout.sh` runs **Then** it stops, runs on the first port and waits for health

#### No 502 across a real deploy (rules 4, 5; owner-verified)
- **Given** the host with the upstream applied
- **When** a staging deploy runs while a probe curls `/api/app/healthz` every 0.5 s
- **Then** no probe answers non-200

### Notes
- Memory during the overlap: two prod API containers at the PAD-590 cap (512 MB) for a few seconds;
  a concurrent staging deploy makes four. Accepted.
- GAP (NORMAL, pre-existing): the shared SSE hub (`packages/api/src/sse.ts`) reconnects with
  back-off but does nothing on re-open, so an event published while a client was disconnected
  (any network blip, and the few seconds of a deploy overlap) shows only at the next refetch
  (within the `client.query-cache` stale window, or on navigation). A follow-up: on a re-open after
  the first, the hub emits a local `resync` event that both apps' handlers answer by invalidating
  their live queries (web and iOS together, R-024). Out of PAD-588's scope: PAD-616.
- R-027 is unchanged: its rule is `--workers 1`; the overlap and the lock are recorded in the atlas
  decision `2026-10-10-deploy-overlap-and-scheduler-leader.md`.
