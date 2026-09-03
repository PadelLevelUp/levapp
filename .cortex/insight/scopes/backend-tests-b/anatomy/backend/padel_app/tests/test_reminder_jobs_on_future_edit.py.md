---
path: backend/padel_app/tests/test_reminder_jobs_on_future_edit.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 443
size_tokens: 4299
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3fc39bbb1a8417777064dc2be1dba3fdd815f2eaebadaf60ce7be7decd8f1c59"
---

## Purpose

Regression tests (observed in prod 2026-08-04 — a coach's Mon–Fri series had zero `apscheduler_jobs` rows after a "this and all future" edit, so no reminders went out) for reminder-job scheduling across `edit_class_service(scope="future")`. That call delegates to `_apply_future_edit_to_lesson()`, which — whenever the edited occurrence isn't the series' own start date — splits the series into a brand-new `Lesson` via `duplicate_lesson_helper()` and truncates the parent's `recurrence_end`. The `model="LessonInstance"` branch did neither cancel-the-parent's-orphaned-jobs nor schedule-jobs-for-the-new-lesson (unlike the sibling `model="Lesson"` branch), so the split-off lesson silently got no reminders at all — nothing raised, nothing logged. Uses a real `apscheduler.schedulers.background.BackgroundScheduler` with an in-memory jobstore (started paused) via the `memory_scheduler` fixture, monkeypatching `padel_app.scheduler._app`/`_scheduler`, so assertions are on actual scheduled jobs rather than a mock call. Pins: the split-off new lesson gets its own reminder jobs; the parent's orphaned jobs at/after the split boundary are cancelled; when the edit MOVES the occurrence date, the parent is truncated at the NEW date (not the edited occurrence's date), so jobs strictly between the two survive — same off-by-one existed in the sibling `model="Lesson"` branch; `_run_extend_schedule_window` (the daily safety-net sweep, spec `notifications.reminders`) re-derives missing jobs for any lesson left with none, including a backdated series (a split leaves the new lesson with the parent's — possibly past — `start_datetime`, and the sweep must still schedule its FUTURE occurrences without retro-firing past ones); and a scheduler failure during the edit (jobstore down) must not fail the HTTP response, since the DB edit commits before the scheduler is touched (PAD-10).

## Connections

- Uses: `padel_app.scheduler` (`schedule_lesson_reminder_jobs`, `_compute_timing_dt` indirectly, `_run_extend_schedule_window`, module globals `_app`/`_scheduler` monkeypatched by the fixture), `padel_app.services.lesson_service` (`edit_class_service`, `get_or_materialize_instance`), `padel_app.models.User`, `padel_app.models.Association_CoachClub`, `padel_app.models.Association_CoachLesson`, `padel_app.models.clubs.Club`, `padel_app.models.coaches.Coach`, `padel_app.models.lessons.Lesson`, `padel_app.sql_db.db`, third-party `apscheduler.jobstores.memory.MemoryJobStore` and `apscheduler.schedulers.background.BackgroundScheduler`; the `app` fixture from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): `test_scheduler_job_lifecycle.py` (also drives real/mocked APScheduler job lifecycle around lesson edit/delete, from a narrower per-instance angle rather than the future-scope-split angle); `test_notification_schedule.py` (also exercises `_compute_timing_dt`/timing logic in the same `scheduler` module).
