---
path: backend/padel_app/tests/test_notification_integration.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 770
size_tokens: 8382
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "411913f8289c7175c9b502c60e155c3495cb7dc701bce31391b01c1adb8f8d64"
---

## Purpose

Integration tests against a real SQLite-backed app for the invitation lifecycle in `notification_service`: `trigger_invitations` (skips when `auto_notify_enabled` or `instance.notifications_enabled` is off, creates structural vacancies for underfilled classes, creates a `Vacancy` when a presence is marked absent, returns `[]` for a class already in the past) and `respond_to_notification` (yes → enrolls the player, marks the vacancy `filled`, expires competing `NotificationEvent`s; no → marks the event `expired`; yes on an already-filled vacancy → `spot_filled_waiting_list_offered`). The largest section, `TestPastClassInvitationExpiry` (PAD-68 follow-up), pins that every un-actioned invitation is retired once its class is over (started/canceled/completed) via both the scheduled sweep (`process_invitation_batches`) and lazy paths (`respond_to_notification`, `coach_respond_to_notification`, `respond_to_waiting_list`, `respond_to_reminder`), that a late "yes" enrolls nobody and a late "no" sends no replacement, that manual (vacancy-less) invitations are swept via `NotificationEvent` directly, that in-time responses are unaffected, and that repeated late retirement is idempotent (no double-retire, no duplicate `NotificationEvent`).

## Connections

- Uses: `padel_app.services.notification_service` (`trigger_invitations`, `respond_to_notification`, `coach_respond_to_notification`, `respond_to_waiting_list`, `respond_to_reminder`, `process_invitation_batches`, `send_manual_notifications`, `_send_invitation_batch`, `get_or_create_config`, patched `publish`/`send_push_notification`), `padel_app.models.users.User`, `padel_app.models.coaches.Coach`, `padel_app.models.players.Player`, `padel_app.models.coach_levels.CoachLevel`, `padel_app.models.lessons.Lesson`, `padel_app.models.lesson_instances.LessonInstance`, `padel_app.models.clubs.Club`, `padel_app.models.Association_CoachLessonInstance`, `padel_app.models.Association_PlayerLessonInstance`, `padel_app.models.Association_CoachPlayer`, `padel_app.models.notification_config.NotificationConfig`, `padel_app.models.notification_event.NotificationEvent`, `padel_app.models.vacancy.Vacancy`, `padel_app.models.presences.Presence`, `padel_app.models.messages.Message`, `padel_app.models.waiting_list_entry.WaitingListEntry`, `padel_app.sql_db.db`; the `app` fixture from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): `test_notification_schedule.py` (its `TestProcessInvitationBatches._stub_stale_sweep` explicitly defers to this file's `TestPastClassInvitationExpiry` for DB-backed sweep coverage); `test_reminder_response_idempotency.py` and `test_semi_auto_approval.py` (adjacent response/idempotency behaviour on the same notification pipeline).
