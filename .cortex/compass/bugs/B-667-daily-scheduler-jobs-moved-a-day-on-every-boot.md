---
id: B-667
title: "extend_schedule_window and prune_delivery_incidents were IntervalTrigger(days=1) re-registered with replace_existing on every boot, so each boot moved their next run to boot + 24 h; with a deploy a day they never fired"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - backend/padel_app/scheduler.py
  - delivery.worker-role
  - classes.recurrence
  - admin.engine-health
proposed_fix: "Every daily job runs at a fixed UTC minute (CronTrigger) with a 6 h misfire grace; a boot whose store shows a missed daily run adds one <id>_catchup; worker-role rule 4."
opened: 2026-10-22T10:30:00Z
resolved: 2026-10-22T11:30:00Z
---

# B-667: the daily jobs slipped a day with every deploy

**Source:** an ops review by la-2110-SessionG, routed by the coordinator to la-2110-SessionF (the
worker-role owner), 2026-10-22. Found by reading, then confirmed on prod.

**Mechanism:** `init_scheduler` registers its recurring jobs on every boot with
`replace_existing=True`. For `IntervalTrigger(days=1)` that recomputes the next run from the boot:
boot + 24 h. `retention_sweep` (PAD-638) had already been made a fixed-hour cron for exactly this
reason; `extend_schedule_window` (PAD-121's daily safety net) and `prune_delivery_incidents`
(PAD-534) had not.

**Evidence (read-only, 2026-10-22):**
- Prod job store: `extend_schedule_window` and `prune_delivery_incidents` next run
  2026-10-23 05:29:54 UTC, the prod container having started 05:29:47 (boot + 24 h to the second).
  Staging: both at 2026-10-23 08:23:20, the worker having started 08:23:14. `retention_sweep` at
  03:17 as designed.
- Container logs can't count past runs: every deploy replaces the container (prod `padelapp` log
  starts at its 05:29 boot: 0 "extend_schedule_window: scheduled" lines, 1 startup reschedule).
  From deploy-prod runs: 27 prod boots in 30 days, 8 deploy-free gaps over 24 h, so the daily jobs
  ran roughly 19 times in 30 days, only after a deploy-free day.
- Reproduced in a test: two boots against one job store moved both jobs' next run.

**Why nothing was missed yet:** every boot and every leadership acquire runs `_startup_reschedule`,
which does the same per-coach pass as `extend_schedule_window`. Prod's horizon was intact (313
lesson-reminder jobs, the furthest 2026-12-18). `delivery_incidents` held 1 row, so the prune had
nothing to do. The exposure was a coach whose startup re-arm failed (PAD-478 logs it with "the daily
pass derives again"): under daily deploys that daily pass never came. A family-2 risk (a missing
send), not yet a hit.

**Root cause:** delivery.worker-role had no rule on how recurring jobs survive a boot; the one
instance of the rule lived in admin.data-retention rule 2, for `retention_sweep` only
(incomplete-rule).

### Change Plan (executed)
1. delivery.worker-role rule 4 + two criteria; classes.recurrence rule 5 (it still said weekly);
   admin.engine-health and admin.data-retention pointers; R-010 lists `<daily id>_catchup`.
2. `test_b667_daily_jobs_survive_a_boot.py`: every daily job is a CronTrigger and no interval of an
   hour or more remains; a second boot keeps each next run; a stored past next run adds one catch-up
   (and only for that job); a first boot adds none; the API under the split still registers nothing.
   Red on the old code (3 of 5), green after.
3. `scheduler.py`: `DAILY_JOBS` (02:47, 03:07, 03:17 UTC) registered by `_register_daily_jobs` on
   the started (paused) scheduler, so it can read each job's stored next run before replacing it.

### Resolution
- Spec changes: delivery/worker-role (rule 4, 2 criteria), classes/recurrence rule 5,
  admin/engine-health, admin/data-retention, R-010.
- Tests: `backend/padel_app/tests/test_b667_daily_jobs_survive_a_boot.py` (5).
- Code: `backend/padel_app/scheduler.py`. No migration (the job store re-pickles on registration).
