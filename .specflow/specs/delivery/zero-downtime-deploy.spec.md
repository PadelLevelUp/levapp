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
> The staging sync's health check follows the published port (`docker port`), since staging may
> answer on 5102 after a rolling deploy.
> PAD-691 + PAD-696 (wave 16, la-2110-SessionF, design reviewed by the architecture session and the
> coordinator 2026-10-21): migrations leave the container entrypoint and become the deploy's migrate
> step (rules 4, 7, 9); the image refuses to boot against a schema behind its head (rule 10);
> `/healthz` is readiness and `/livez` liveness (rule 11); expand/contract (rule 12). Rules 9–12 are
> self-numbered, unconfirmed.

### Intent
A deploy starts the new API container beside the old one, waits until it answers `/healthz`, and
only then stops the old one. Host nginx sends `/api` to whichever of two loopback ports answers.
Because both containers share the Postgres job store for those seconds, only one process may run
APScheduler: leadership is a Postgres advisory lock, and the startup reschedule moves off
gunicorn's boot path into the leadership thread.

### Surfaces
- `backend/padel_app/scheduler_leadership.py` (new), `backend/padel_app/scheduler.py`
  (`init_scheduler`, `use_scheduler_leadership`, `_start_scheduler_leadership`).
- Migrate and readiness half (PAD-691/696): `backend/padel_app/schema_state.py`,
  `backend/padel_app/migrate.py`, `backend/scripts/migrate.sh`, `backend/scripts/entrypoint.sh`,
  `backend/Dockerfile` (`SCHEMA_GATE=on`), `/api/app/healthz` and `/api/app/livez`
  (`modules/frontend_api.py`), `backend/scripts/sync-staging-db.sh`, `docs/infra/probes.md` (local).
- Rollout half: `backend/scripts/rollout.sh` (new, scp'd by the deploys), `deploy-prod.yaml`,
  `deploy-staging.yaml`, `infra/nginx/conf.d/levapp-api-upstream.conf` (new) and the `levapp` /
  `levapp-staging` vhosts (owner applies on the VM).
- Web, mobile — no change.

### Rules

1. **One scheduler leader per database.** (With `WORKER_SPLIT` on, only worker processes compete
   and the API is a job-store client: `delivery.worker-role`.) Outside TEST_MODE and the PAD-610
   E2E hold, every API process starts APScheduler **paused** and runs a leadership thread. The thread takes
   `pg_try_advisory_lock(SCHEDULER_LOCK_KEY)` on a dedicated, unpooled connection; the holder runs
   the startup reschedule, then resumes its scheduler. `SCHEDULER_LEADERSHIP=off` disables it
   (single-process escape hatch).
2. **Leadership follows the session.** The holder pings its connection every 5 s. When the session
   dies (Postgres restarted, the container stopping) the lock is gone: the holder pauses its
   scheduler and retries; the other process takes the lock within one interval of the old
   session ending. A failing reschedule gives the lock back and retries.
3. **The reschedule is off the boot path.** gunicorn accepts requests while the leadership thread
   re-arms jobs; `/api/app/healthz` does not wait for it.
4. **Migrate, then start before stop.** (rollout half) With `--migrate` (both deploys pass it) the
   deploy first runs the migrate step (rule 9) to completion while the old container keeps
   serving, and logs that the old container serves during it; a failed migrate step ends the
   deploy there, before any API container is touched. It then starts the new container as
   `<name>_next` on the idle loopback port of the pair (prod 5000/5002, staging 5100/5102), polls
   `http://127.0.0.1:<port>/api/app/healthz` until 200 (timeout 120 s; on timeout the new one is
   removed and the old one keeps serving). It keeps the old container serving for the idle port's
   nginx `fail_timeout` + 1 s more, read from the upstream conf (nginx's default 10 s when absent),
   counted from "healthy": a request nginx sent to the booting port may have marked it down, and
   stopping the old one inside that window leaves no live upstream (B-664). With `--probe-host`
   (both deploys pass their vhost) one request through nginx must then answer below 500, or the new
   one is removed and the old keeps serving. Only then it stops the old container with `docker stop -t 10`,
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
7. **Migrations must work with the previous release's code.** The deploy's migrate step (rule 9),
   not the container, migrates, and in a rolling deploy it does so while the old container still
   serves. A migration the old code cannot run against (a dropped or renamed column it reads) is
   deployed with the `workflow_dispatch` choice `rollout: stop-first`: the old container is
   stopped (kept, not removed), the migrate step runs, the new container starts; if the migrate
   step or the new container fails, the old container is started again and the deploy fails.
   The `ssh-action` step allows 30 min (`command_timeout`), so a long migration runs out in a
   rolling deploy instead of failing the job.
8. **Workers stay at one.** Each container keeps gunicorn `--workers 1` (R-027). During the few
   seconds of overlap two processes serve; an SSE event published by one does not reach a stream
   attached to the other until that stream reconnects (the old container stopping closes it).
9. **The migrate step.** `scripts/migrate.sh` (a thin wrapper over `python -m padel_app.migrate`)
   is the one migration command: the rollout runs it in a one-shot container of the new image
   (the API's `docker run` arguments without `--restart`, foreground, so its log is in the
   deploy output); the staging sync runs it after a restore; the GKE migrate Job will run it
   (PAD-698). It (a) takes a Postgres session advisory lock (`MIGRATE_LOCK_KEY`, not the
   scheduler's) on its own autocommit connection and holds it across the upgrade, printing
   "waiting for migrate lock" every 30 s and giving up with exit 3 after `MIGRATE_LOCK_TIMEOUT`
   (default 1500 s, under the ssh step's 30 min); (b) does nothing and exits 0 when the database is
   **ahead** of the image (a `rollback_to`: an older image's `flask db upgrade` cannot locate the
   newer revision) or already at head; (c) otherwise runs the unchanged `python -m flask --app
   app.py db upgrade` (so `is_migration_invocation` keeps the scheduler off and the production
   guard on); (d) re-reads the schema and exits 1 unless it is at head. `env.py` runs every
   pending migration in one transaction, so a failed upgrade leaves the schema as it was —
   **except** work done in an autocommit block (`CREATE INDEX CONCURRENTLY` and the like), which
   is not undone: a migration that needs one must be safe to re-run. `flask db check` is not run
   here: it stays the CI drift gate (deploy workflows' drift-gate job), which already reads the
   scrubbed prod copy on every staging deploy.
10. **The image refuses to boot behind its head.** The entrypoint no longer migrates. It runs
   `python -m padel_app.schema_state --require not_behind` and only then `exec`s gunicorn. The
   database's `alembic_version` is classified against the image's migration scripts: **at_head**;
   **behind** (every revision known to the image, not all heads); **ahead** (a revision the
   image does not know); **empty** (no table or no row). Behind or empty: one line with the state
   and both revision lists (no secrets) and exit 1, before gunicorn listens. (Docker's userland
   proxy still accepts on the published loopback port while the container lives, so for those
   seconds a request gets a reset rather than a refusal: B-663, remedy PAD-714.) Ahead: one warning
   line and boot (expand/contract, rule 12, is what makes that safe — the same state the old
   container serves on during every rolling deploy). A connection error is retried for 30 s
   (`SCHEMA_GATE_DB_WAIT`) before exiting, because after a host reboot Docker starts Postgres and
   the API in no particular order. `SCHEMA_GATE=off` skips the check (the only escape hatch);
   the Dockerfile sets `SCHEMA_GATE=on`, every other way of running the app (pytest, Playwright,
   the Android lane, local runs) leaves it off. **On the VM this exit is the gate:** nginx
   round-robins both ports and fails over only on a connection error, never on a 503, so a
   container that served while unready would take requests; the exit ends it in seconds. **On GKE readiness (rule
   11) is the gate**, and the exit makes a stale pod crash-loop visibly until the migrate Job
   has run.
11. **Readiness and liveness.** `/api/app/livez` answers 200 `{"status": "ok"}` without touching
   the database. `/api/app/healthz` answers 503 `db_unreachable` when `SELECT 1` fails and,
   when `SCHEMA_GATE` is on, 503 `schema_behind` when the schema is behind or empty; at head
   it answers 200 `ok`, and **ahead answers 200 `schema_ahead`** (readiness means "not behind
   head": the old container stays ready through the overlap). The schema reading is cached
   for 10 s. Both are unauthenticated and carry no rate limit. `rollout.sh` and the staging sync
   wait on `healthz`; Kubernetes uses healthz for readiness and startup and livez for liveness
   (probe matrix in `docs/infra/probes.md`).
12. **Expand, then contract.** Because the previous release runs on the new schema during every
   rolling deploy (and after a `rollback_to`): a new column is nullable or has a server default;
   a column or table is dropped or renamed only in a release after the one whose code stopped
   reading it; anything else ships with `rollout: stop-first`. A warn-only CI guard is PAD-711.
   Because the migrate step now runs while the old container serves, schema changes take a short
   `lock_timeout` and data backfills run in batches outside the schema transaction: PAD-718.
13. **The worker follows the API.** (PAD-695, `delivery.worker-role`.) The deploys pass
   `--worker` when their env file sets `WORKER_SPLIT` on. After the API swap succeeds (both
   modes), `rollout.sh` starts `<name>_worker_next` from the same arguments plus
   `--memory 256m -e ROLE=worker` and the command `python -m padel_app.worker`, with no published
   port; waits up to 60 s for its `/livez` (through `docker exec`: the image has no curl), failing
   early on a restart; stops the old `<name>_worker` with a 60 s grace (running jobs finish);
   renames the new one; and requires `/livez` to say `"leader": true` within 30 s. With the flag on
   the API never competes, so a worker that never leads means no job runs anywhere. An unanswering
   new worker is removed and the old one keeps leading (exit 1); one that does not lead is left
   running, since it may still take over (exit 1). Without `--worker` a leftover `<name>_worker` is
   stopped and removed: the flag went off and the API competes again. The deploy workflow itself also
   removes a leftover `<name>_worker` whenever it passes no `--worker`, or the checked-out
   `rollout.sh` has no `--worker` case (a `rollback_to` from before the worker role, whose script
   can neither swap nor remove one). Jobs never run twice in any mix: every scheduler gates on the
   same advisory lock.

14. **A second API copy (PAD-704, B8 on staging).** `--copies 2` (the workflows pass it when the
   env file says `API_COPIES=2`; staging does, prod does not) starts `<name>_b` of the same image
   and arguments after the swap and the worker, on the port the old copy freed, and waits for its
   health, so both ports of the upstream serve. No third port, no upstream edit, no host step.
   - Every deploy first stops and removes the last deploy's `<name>_b` (after the migrate step,
     so both copies serve through it): it holds the idle port. Each deploy therefore has a
     one-copy moment, today's steady state.
   - `--copies 1` (the default) removes a leftover `<name>_b`. Stop-first never runs a second
     copy.
   - A second copy that doesn't answer is removed and the run is red; the first copy serves.
   - `--copies` goes through B-666's filter. An older checked-out `rollout.sh` (a rollback) can't
     free that port, so the workflow removes `<name>_b` itself before calling it.
   - The staging sync stops `<name>_b` with the API and starts it after.
   - Rollback for the week is `API_COPIES` back to 1, or `docker stop <name>_b`.

15. **(PAD-697) A deploy of the events process drops every stream once.**
    gunicorn's graceful timeout cannot drain a stream, and `STOP_GRACE` is 10 s, so every client
    reconnects within its jittered back-off (≤ 30 s) and resyncs (messaging.sse-realtime rule 19,
    PAD-616). Each reconnect costs one JWT blocklist query on the handshake. The staging check counts
    that storm and the events container's RSS with 300 streams (delivery.events-role).

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

#### The migrate step runs before the new container, while the old one serves (rules 4, 9)
- **Given** `padelapp` live on 5000 and `--migrate`
- **When** `rollout.sh` runs
- **Then** a one-shot `padelapp_migrate` container of the same image runs `/app/scripts/migrate.sh`
  without `--restart`, before `padelapp_next` is created, and the log says the old container
  serves during it

#### A failed migrate step touches no API container (rules 4, 9)
- **Given** `padelapp` live on 5000 and a migrate step that exits 1
- **When** `rollout.sh --migrate` runs
- **Then** it exits 1, `padelapp_next` was never created and `padelapp` was never stopped

#### Stop-first migrates after the stop and restarts the old one on failure (rule 7)
- **Given** `padelapp` live and `--stop-first --migrate`
- **When** the migrate step runs **Then** it runs after `docker stop padelapp`; **and when** it
  fails **then** `padelapp` is started again and the deploy exits 1

#### The migrate step does nothing on a newer schema (rule 9)
- **Given** a database whose `alembic_version` holds a revision the image does not know
- **When** `python -m padel_app.migrate` runs
- **Then** it exits 0 without running `flask db upgrade`

#### The migrate step waits for a concurrent one, within a bound (rule 9)
- **Given** another session holding `MIGRATE_LOCK_KEY` and `MIGRATE_LOCK_TIMEOUT=2`
- **When** `python -m padel_app.migrate` runs
- **Then** it prints "waiting for migrate lock" and exits 3 without running the upgrade

#### The migrate step must end at head (rule 9)
- **Given** an upgrade subprocess that exits 0 but leaves the schema behind
- **When** the migrate step re-reads the schema **Then** it exits 1

#### A stale image never binds a port (rule 10)
- **Given** a database at an ancestor of the image's head (or empty) and `SCHEMA_GATE=on`
- **When** `python -m padel_app.schema_state --require not_behind` runs
- **Then** it prints `schema behind` with both revision lists and exits 1; ahead prints a warning
  and exits 0; `SCHEMA_GATE=off` exits 0 without connecting

#### Readiness says not-behind, liveness says alive (rule 11)
- **Given** `SCHEMA_GATE=on`
- **When** the schema is behind **Then** `/healthz` is 503 `schema_behind` and `/livez` is 200;
  **when** ahead **then** `/healthz` is 200 `schema_ahead`; **when** the database is unreachable
  **then** `/healthz` is 503 and `/livez` is still 200

#### The staging sync brings a restored prod copy to head (rules 9, 11)
- **Given** a restore of prod's dump into the staging database
- **When** the sync restarts the app
- **Then** it first runs `/app/scripts/migrate.sh` in a one-shot container of the staging
  container's own image, env (a mode-600 env-file from `docker inspect`, removed afterwards;
  variables the image itself sets and multi-line values left out, the latter named in the log)
  and network, then starts the container and waits on `/healthz`

#### A bad release never takes the old one down (rule 4)
- **Given** a new container that never answers, or restarts
- **When** `rollout.sh` runs **Then** it is removed, the old container was never stopped, and the
  deploy fails with the new container's log

#### The old port outlives the new port's fail_timeout (rule 4, B-664)
- **Given** the upstream conf gives the idle port `fail_timeout=7s` and the new container is healthy
- **When** `rollout.sh --probe-host levapp.app` runs **Then** it waits 8 s, sends one request to
  `https://levapp.app/api/app/healthz` through nginx, and only then stops the old container; a 5xx
  there removes the new container and leaves the old one serving; a 4xx counts as live

#### The worker swaps after the API and must lead (rule 13)
- **Given** a live API and `padelapp_worker` **When** `rollout.sh --worker` runs **Then** after the
  API rename it starts `padelapp_worker_next` (`--memory 256m -e ROLE=worker`, no `-p`, command
  `python -m padel_app.worker`), stops the old worker with `-t 60` once the new one answers, and
  succeeds only when the renamed worker reports `leader: true`; an unanswering new worker is removed
  and the old one kept; a new worker that never leads leaves the run red with the worker running;
  without `--worker` a leftover worker is removed

#### A second copy on the freed port (rule 14)
- **Given** a live `padelapp` on 5000 **When** `rollout.sh --copies 2` runs **Then** `padelapp` serves
  on 5002 and `padelapp_b` on 5000, started after the rename
- **Given** `padelapp` and `padelapp_b` from the last deploy **Then** `padelapp_b` stops after the
  migrate step and before `padelapp_next` starts, and comes back on the freed port
- **Given** `--copies 1` or `--stop-first` **Then** no `padelapp_b` is left; a second copy that never
  answers is removed and the run exits 1 with `padelapp` serving

#### A vhost enabled by symlink counts (rule 6, B-662)
- **Given** the upstream file and `sites-enabled/levapp` as a symlink to a vhost that proxies to it
- **When** `rollout.sh` runs
- **Then** it rolls (starts `padelapp_next`), never "no enabled vhost"

#### No upstream on the host, no rolling (rule 6)
- **Given** no upstream file, or no enabled vhost proxying to it
- **When** `rollout.sh` runs **Then** it stops, runs on the first port and waits for health

#### No 502 across a real deploy (rules 4, 5; owner-verified)
- **Given** the host with the upstream applied
- **When** a staging deploy runs while a probe curls `/api/app/healthz` every 0.5 s
- **Then** no probe answers non-200

### Notes
- Image-level proof of rules 9-11 is manual: `backend/scripts/smoke_image_schema_gate.sh <image>`
  (Docker + a local Postgres; not CI). Run it after any change to the Dockerfile, the entrypoint
  or the migrate step: the stub tests replace Docker, and the first PAD-691 build gated its own
  migrate one-shot (ENTRYPOINT runs for it too), which only the real image showed.
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
