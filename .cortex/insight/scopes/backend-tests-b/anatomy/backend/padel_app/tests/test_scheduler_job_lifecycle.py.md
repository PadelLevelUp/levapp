---
path: backend/padel_app/tests/test_scheduler_job_lifecycle.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 339
size_tokens: 3609
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "336a07249059399c7f6fa2d36ef9461161c2b9a0db94d56b0f193337fc3106c3"
---

## Purpose

Tests that APScheduler reminder jobs are correctly scheduled, rescheduled, and cancelled as classes are created, edited, and deleted. Most tests patch `padel_app.scheduler.schedule_instance_jobs`/`cancel_instance_jobs` (mock-based, no real scheduler needed) and assert the new call signature — `schedule_instance_jobs(instance_id, coach_id)` and `cancel_instance_jobs(instance_id)`, no `app` argument: `TestEditReschedulesJobs` pins that `lesson_service.edit_lesson_instance_helper` reschedules on edit and doesn't crash when the instance has no coach association; `TestDeleteCancelsJobs` pins that `delete_future_instances` cancels a job per deleted instance and that `remove_class_service(scope="single")` on a `LessonInstance` cancels exactly one job and returns `{"status": "deleted"}`. `TestSendClassReminders` (real DB, no scheduler mock) exercises `notification_service.send_class_reminders` end-to-end: exactly one message per enrolled player, no-op for a past-started or canceled instance. `TestComputeTimingDt` re-tests `scheduler._compute_timing_dt` hours_before/days_before-at-time arithmetic including the PAD-134 club-local wall-clock conversion, and the None-returning empty/missing-type config cases — overlapping coverage with `test_notification_schedule.py`.

## Connections

- Uses: `padel_app.services.lesson_service` (`edit_lesson_instance_helper`, `delete_future_instances`, `remove_class_service`), `padel_app.scheduler` (`schedule_instance_jobs`, `cancel_instance_jobs`, `_compute_timing_dt`, patched), `padel_app.services.notification_service.send_class_reminders` (patched `publish`/`send_push_notification`), `test_notification_reminder_flow.py` (imports `_seed_coach_and_student`, `_seed_instance` directly in `TestSendClassReminders`), `padel_app.models.users.User`, `padel_app.models.coaches.Coach`, `padel_app.models.clubs.Club`, `padel_app.models.lessons.Lesson`, `padel_app.models.lesson_instances.LessonInstance`, `padel_app.models.Association_CoachLesson`, `padel_app.models.Association_CoachLessonInstance`, `padel_app.models.messages.Message`, `padel_app.sql_db.db`; the `app` fixture from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): `test_notification_schedule.py` (duplicates `_compute_timing_dt`/PAD-134 coverage from the pure-timing-logic side rather than the job-lifecycle side); `test_reminder_jobs_on_future_edit.py` (same APScheduler job domain, real in-memory scheduler and the future-scope-split angle rather than mocked schedule/cancel calls).
