---
path: backend/padel_app/scheduler.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 782
size_tokens: 7320
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "17cde659c640c3d238db7520ae1c29ebb6312eeea48f3c340d13f301b492af19"
---

## Purpose

APScheduler integration wiring class reminders and invitation-window
opens to wall-clock time. Uses one process-global `BackgroundScheduler`
(module singletons `_app`/`_scheduler`, set once by `init_scheduler`
and looked up at call time rather than passed as pickled job args,
since the Flask app isn't picklable). Two per-occurrence DateTrigger job
families — `reminder_lesson_{lesson_id}_{date}` (primary: materializes
the instance on fire) and `reminder_{instance_id}` (legacy, for
already-materialized instances) plus `invite_start_{instance_id}` — and
two recurring IntervalTrigger jobs: `process_batches` (every 2 min,
30s in TEST_MODE, drives `notification_service.process_invitation_batches`)
and `extend_schedule_window` (daily, rolls the reminder horizon forward
AND re-derives any lesson missing its jobs — a self-healing safety net).
Public API: `init_scheduler`, `schedule_lesson_reminder_jobs`,
`cancel_lesson_reminder_jobs`, `cancel_lesson_occurrence_job`,
`schedule_instance_jobs`, `cancel_instance_jobs`,
`reschedule_all_future_jobs`, `ensure_scheduler_ready`, plus safe-no-op
convenience hooks `_maybe_schedule_instance`/`_maybe_cancel_instance` for
`lesson_service.py` to call without checking scheduler state itself.

## Connections

- Uses: `padel_app.utils.dates` (`CLUB_TZ`, `utcnow_naive`); lazy
  imports of `apscheduler` (BackgroundScheduler, DateTrigger,
  IntervalTrigger, SQLAlchemyJobStore/MemoryJobStore),
  `padel_app.models` (`Coach`, `Lesson`, `LessonInstance`,
  `Association_CoachLessonInstance`, `Association_CoachLesson`),
  `padel_app.tools.calendar_tools.expand_occurrences`, and
  `services/notification_service.py` (`get_or_create_config`,
  `send_class_reminders`, `trigger_invitations`,
  `process_invitation_batches`).
- Used by: `services/lesson_service.py` (via `_maybe_schedule_instance`/
  `_maybe_cancel_instance`); `services/season_service.py`
  (`regenerate_future_instances_for_season`, best-effort);
  `services/replacement_approval_service.py`
  (`_compute_invite_start_dt`); `services/notification_service.py`
  presumably reschedules on config change (`reschedule_all_future_jobs`
  is documented as called "when the coach updates reminder/invitation-
  start timing in settings").

## Insights

- `_compute_timing_dt` is the one place that converts a coach's
  CLUB_TZ-local "send at 18:00" setting into an absolute naive-UTC fire
  time — PAD-134 fixed a bug where the hour/minute were stamped directly
  into a naive-UTC datetime, firing every reminder an hour late through
  Portuguese summer time (WEST=UTC+1) and correctly only in winter. The
  day-count offset is also taken from the LOCAL calendar day (not UTC),
  because a 00:30 Lisbon class is still 23:30 UTC the PREVIOUS day — a
  UTC-derived date would land the reminder a day early.
- `init_scheduler` is intentionally skipped in three contexts it
  detects: pytest (`test_config is not None`), non-`flask run` CLI
  subcommands, and the Werkzeug dev-reloader's OUTER watcher process
  (`WERKZEUG_RUN_MAIN` set but not `"true"`) — without the last check,
  the reloader's watcher process would start a second competing
  scheduler alongside the inner worker's.
- `TEST_MODE` swaps `SQLAlchemyJobStore` for `MemoryJobStore` — the
  inline comment explains why: tests drop/recreate the DB on every run,
  and a persistent job store would hold stale connections to a dropped
  `apscheduler_jobs` table and fail silently.
- `_maybe_rearm_reminder` implements a re-fire loop for coaches with
  `get_hours_between_reminders() ` — if `send_class_reminders` reports
  `more_due` (some invited students haven't been reminded yet) AND the
  class hasn't started, it schedules a fresh one-shot job N hours later
  under a timestamp-suffixed id (`{base_job_id}_retry_{unix_ts}`) that
  re-invokes the SAME runner — an unbounded-looking but self-terminating
  chain, since each fire either exhausts `more_due` or the class starts.
- `_run_extend_schedule_window`'s docstring documents a real production
  incident it now guards against: PAD-121, where a "this and all future"
  lesson edit split a series into a NEW `Lesson` row without scheduling
  its jobs, silencing that class's reminders for up to 7 days before the
  (then-weekly) safety net caught it. The interval was tightened to
  daily specifically because of this. Job ids are deterministic and
  `replace_existing=True`, so this daily re-derivation is safe to run
  unconditionally against every coach's every active lesson.
- Job cancellation (`cancel_lesson_reminder_jobs`,
  `cancel_lesson_occurrence_job`, `cancel_instance_jobs`) all wrap
  `job.remove()` in a bare `try/except: pass` — removing a job that
  doesn't exist is treated as a normal no-op, never an error.
- `_app_ctx()` is a context manager that pushes a Flask app context
  ONLY if one isn't already active — its docstring explains this
  matters because job runners are called both from APScheduler's
  background thread (no context) and from request handlers like
  `update_config` → `reschedule_all_future_jobs` (context already
  active); nesting a second context there would trigger its teardown
  handler's `db.session.remove()` on exit and detach objects from the
  OUTER request's session.

## Query pointers

- If you need to change WHEN a reminder or invitation-window fires,
  read `_compute_timing_dt` first — it is the single conversion point
  between a coach's CLUB_TZ setting and the UTC datetime every job is
  armed with.
- If you need to trace why a class's reminders silently stopped firing,
  check `_run_extend_schedule_window`'s daily self-heal and
  `_startup_reschedule` (fires once at process boot) before assuming a
  bug in the per-lesson scheduling call itself — both re-derive missing
  jobs idempotently.
- If you need to change what happens WHEN a job fires, look at the
  `_run_*` runner functions, which delegate to
  `services/notification_service.py` and `services/lesson_service.py`
  (`get_or_materialize_instance`) — this file only owns timing, not
  business logic.
