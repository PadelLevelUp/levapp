---
path: backend/padel_app/tests/test_notification_schedule.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 805
size_tokens: 9369
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3c7cce7b959ed3fd3b7b23de0786f09a7cca055b464b21122d45e325b4d3dafb"
---

## Purpose

Pure/mocked unit tests for the time-injectable notification scheduling logic in `notification_service` and `scheduler`, everything accepting an explicit `now`/timing dict so no clock-freezing is needed. Covers: `_compute_timing_dt` (hours_before, days_before/days_before_at_time arithmetic, and PAD-134's club-local-wall-clock conversion — the same UTC instant must map to different local offsets across WET/WEST, spring-forward DST boundary is exercised too); `_check_restrictions` (PAD-136 quiet-hours window is CLUB-LOCAL not naive-UTC, min-time-before-class, discriminating summer-vs-winter cases proving a real timezone conversion rather than a hardcoded offset); `_check_per_student_daily_limit` (PAD-144: the daily counting window boundary is the club-local calendar day, asserted by inspecting the actual `created_at >=` SQLAlchemy filter bound rather than just the boolean result); `send_class_reminders`'s past/canceled-instance early-exit guard; `process_invitation_batches`'s inactivity timer and past/canceled-class vacancy expiry (stubs `expire_stale_invitations` since the DB-backed PAD-68 sweep is covered in `test_notification_integration.py`); `simulate_batch_processor` (pure dry-run, no DB); and the `fire_dt > now` scheduling predicate used by `schedule_instance_jobs` (tested indirectly since APScheduler isn't installed in the test venv).

## Connections

- Uses: `padel_app.scheduler._compute_timing_dt`, `padel_app.utils.notification_preview.simulate_batch_processor`, `padel_app.models.notification_config.DEFAULT_RESTRICTIONS`, `padel_app.services.notification_service` (`_check_restrictions`, `_check_per_student_daily_limit`, `send_class_reminders`, `process_invitation_batches`, mocked `NotificationEvent`/`LessonInstance`/`Association_CoachLessonInstance`/`Vacancy`/`get_or_create_config`/`_send_invitation_batch`/`expire_stale_invitations`), `padel_app.models.NotificationEvent`; the `app` fixture from `conftest.py` (scope `backend-tests-a`, only for `TestDailyLimit`).
- Used by: —
- Semantically related (not imports): `test_notification_integration.py::TestPastClassInvitationExpiry` (this file's `TestProcessInvitationBatches._stub_stale_sweep` names it as the real-DB counterpart of the stale-invitation sweep it stubs out); `test_scheduler_job_lifecycle.py` (also exercises `_compute_timing_dt` and job scheduling, from the job-lifecycle/APScheduler side rather than the pure-timing side).
