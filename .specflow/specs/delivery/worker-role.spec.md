---
id: delivery.worker-role
status: implementing
depends_on:
  - delivery.zero-downtime-deploy
implements: ../../specs-business/delivery/a-release-never-drops-a-request.business.md
governed_by: [R-027]
---

# delivery.worker-role

> Linear: PAD-695 (B2 of PAD-686). Drafted 2026-10-22 by la-2110-SessionF (wave 17). Design reviewed by
> the architecture session and the coordinator 2026-10-22 (`docs/plans/2026-10-22-pad-695-design.md`,
> local). Deviations from the ticket's text are recorded on PAD-695.

### Intent
The scheduler's jobs (reminders, invitation batches, past-due passes, the daily sweeps) run in a
`worker` process of the same image instead of inside the API, so the API can run as several
copies (PAD-704) and the worker can be sized and restarted on its own. The split is behind a flag
until B8 has proven it.

### Surfaces
- `backend/padel_app/scheduler.py` (`process_role`, `worker_split_enabled`, `scheduler_mode`,
  `init_scheduler`, `_shutdown_quietly`), `backend/padel_app/worker.py` (new).
- `backend/scripts/rollout.sh` (`--worker`, zero-downtime-deploy rule 13),
  `backend/scripts/sync-staging-db.sh` (stops and starts the worker around a restore),
  `deploy-staging.yaml` / `deploy-prod.yaml`, `backend/.env.staging` (`WORKER_SPLIT=on`),
  `backend/.env.prod` (`WORKER_SPLIT=off`).
- Web, mobile: no change.

### Rules

1. **Roles and the split.** `ROLE` is `api` (default), `worker` or `events` (PAD-697: the process
   that holds the live-update streams); anything else is `api`. `WORKER_SPLIT` (default off) decides
   the scheduler's mode in each process:

   | | `WORKER_SPLIT` off | `WORKER_SPLIT` on |
   |---|---|---|
   | `api` (gunicorn) | competes for the scheduler-leader lock (zero-downtime-deploy rules 1–3) | **job-store client** |
   | `worker` | no scheduler (idles, see rule 2) | competes for the lock |
   | `events` | **no scheduler** (B-677) | **no scheduler** |

   A job-store client starts its scheduler **paused** and never resumes it: request handlers
   still call `schedule_*`/`cancel_*`, which write the shared `apscheduler_jobs` table through
   it. It registers none of the recurring jobs (`replace_existing` on a started scheduler resets
   their next run time, so every API boot would push the worker's interval jobs forward), runs no
   leadership thread and no startup reschedule. TEST_MODE keeps one in-memory job store per
   process, so the split does not apply there. `ROLE` is set by the deploy with `-e`, never in an
   env template.
2. **The worker process.** `python -m padel_app.worker` (through `entrypoint.sh`, so the schema
   boot gate applies) builds the app with `ROLE=worker` and:
   - **waits for the lock without exiting**, with a WARNING every 60 s while another process holds
     it; an exit under `--restart unless-stopped` would re-run the boot every few seconds;
   - **wakes its scheduler every `WORKER_WAKE_SECONDS` (5) while it leads.** APScheduler sleeps
     until the next run time it knows of, and jobs the API adds are not ones it knows: without
     the wakeup a reminder the API arms for the next minute would wait for `process_batches`
     (up to 120 s);
   - **answers `/livez` on `WORKER_LIVEZ_PORT` (8081)**, with no database call:
     `{"status": "alive", "leader": bool, "split": "on"|"off"}`;
   - logs one line a minute: leader, job count, push queue, push stats (PAD-689 may extend it);
   - **on SIGTERM**, shuts the scheduler down waiting for running jobs, drains the push queue
     (up to 5 s), then gives up the lock (closing its session). The lock goes last, so another
     worker never starts a job this one is still running. The exit hooks skip a scheduler that
     is already shut down;
   - with `WORKER_SPLIT` off, starts no scheduler and idles with `/livez` answering (`split:
     "off"`): the deploy removes it (zero-downtime-deploy rule 13).
3. **What the split needs, and what stays in the API until later tickets.**
   - Jobs publish live events (`realtime.publish`). A worker holds no streams, so the split needs
     `SSE_BROKER=postgres` (PAD-692): the publish is a `realtime_events` row and a NOTIFY that
     the API's listener fans out. A worker under the memory broker logs a WARNING at boot.
   - Pushes produced by jobs go out through the worker's own in-process sender. Pushes produced
     by requests still go through the API's (lazy, started on the first `submit`). With
     `PUSH_QUEUE=outbox` (PAD-699, `messaging.push-notifications` rule 10a) both become outbox
     rows, drained by the scheduler leader; the worker stops its drainer before releasing the
     lock.
   - The staging sync stops the worker with the API before a restore (it holds connections to
     the target and would run jobs on a half-restored database) and starts it after the API.
4. **A daily job fires whatever the deploy rhythm (B-667).** Every recurring job of a day or more
   runs at a fixed UTC minute (`CronTrigger`), never `IntervalTrigger(days=…)`: the scheduler
   re-registers its jobs with `replace_existing` on every boot, which put an interval's next run at
   boot + 24 h, so with a deploy a day it never fired. The daily jobs are `extend_schedule_window`
   02:47, `prune_delivery_incidents` 03:07, `retention_sweep` 03:17 and `finance_gcp_import` 04:07 (admin.finance, PAD-742), each with a 6 h misfire
   grace (a run due while the leader is paused for a lock handover still runs). A boot whose job
   store holds a daily job whose next run is already past (no leader was running at its minute)
   adds one `<id>_catchup` run now. The jobs are idempotent, so a catch-up that races the outgoing
   leader's own run costs one extra pass. Sub-hour intervals (`process_batches`, 2 min) stay
   intervals: a boot delays them at most one interval.

### Acceptance Criteria

#### The API under the split is a job-store client (rule 1)
- **Given** `ROLE=api`, `WORKER_SPLIT=on`, outside TEST_MODE
- **When** the app boots **Then** its scheduler is paused (and `running`), holds none of the
  recurring jobs, runs no leadership thread and no reschedule, and a job it adds is in the
  shared store

#### The modes follow role and flag (rule 1)
- **Given** each of api/events/worker with the flag on and off **When** the mode is computed
  **Then** it is: api off → compete, api on → client, events off → off, events on → off (B-677:
  an events process neither runs jobs nor writes the job store), worker on → compete, worker off →
  off (no scheduler)

#### The worker waits for the lock without exiting (rule 2)
- **Given** another process holds the lock **When** the worker has waited 61 s **Then** it has
  logged one WARNING, has not exited and has not woken its paused scheduler

#### The leader wakes for jobs it did not add (rule 2)
- **Given** the worker leads **When** its loop ticks **Then** it calls `wakeup()` each tick

#### Shutdown finishes jobs before giving up the lock (rule 2)
- **Given** a SIGTERM **When** the worker stops **Then** the order is: scheduler shutdown with
  `wait=True`, push drain, leadership stop

#### Staging splits, prod does not (rule 3)
- **Given** the env templates **Then** `.env.staging` has `WORKER_SPLIT=on` and
  `SSE_BROKER=postgres`, `.env.prod` has `WORKER_SPLIT=off`, and neither sets `ROLE`

#### The sync stops the worker around a restore (rule 3)
- **Given** a `padelapp_staging_worker` container **When** the sync restores **Then** it stops
  the worker after the API and before the restore, and starts it after the API

#### One reminder, fired in the worker (rules 1, 2; docker smoke)
- **Given** an API and a worker against one Postgres with the split on **When** the API arms a
  job 20 s ahead **Then** it fires once, in the worker, and its live event reaches a stream held
  by the API

#### A boot never moves a daily job (rule 4)
- **Given** a job store where a previous boot registered the daily jobs
- **When** the process boots again
- **Then** each daily job is a `CronTrigger` with the same next run as before, and no recurring job
  of an hour or more is an `IntervalTrigger`

#### A missed daily run is caught up once (rule 4)
- **Given** a job store where `extend_schedule_window`'s next run is 2 h in the past
- **When** the process boots
- **Then** `extend_schedule_window_catchup` runs now, `extend_schedule_window` is back on its fixed
  minute, and no catch-up is added for a daily job that was not missed (nor on a first boot)

### Notes
- B8 (PAD-704) turns the flag on in prod after a week on staging; GKE runs the worker as its own
  Deployment with `livez` on 8081 (PAD-698).
- Leaderless windows: about 5 s per deploy (the old worker stops; the waiting new one takes the
  lock on its next try); up to about 65 s once, on the first deploy that turns the flag on (the
  old API leader stops at the API swap; the worker starts after it). Reminder jobs have a 300 s
  grace, `process_batches` coalesces.
