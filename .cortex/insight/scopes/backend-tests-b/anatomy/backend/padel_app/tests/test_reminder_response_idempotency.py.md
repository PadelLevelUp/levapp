---
path: backend/padel_app/tests/test_reminder_response_idempotency.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 281
size_tokens: 2869
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5f92bf12e8024fa2e5bd284f50120e5c9174ef78cb79a486ca083b39423d52b5"
---

## Purpose

PAD-94 regression tests: a student who taps "No" on a class reminder multiple times (production incident 2026-07-21: 8 taps in ~62s) used to run `respond_to_reminder` in full every time, sending 8 separate `reminder_declined` system messages and re-driving the invitation engine 8 times, fanning out 8 duplicate "a spot opened" invitations to the same replacement candidates. Fix: re-submitting the SAME answer already on record for a `(player, instance)` pair is a no-op returning `{"action": ..., "duplicate": True}` — no second system message, no vacancy churn, no re-fan-out — while changing the answer is never suppressed and a genuinely new (re-sent) reminder is always answerable again even with the same answer (PAD-49 rule 9: a fresh reminder is a new question). `TestReminderResponseIdempotency` covers: three rapid "no" taps producing exactly one decline message, one vacancy, and one round of invitations with no candidate invited twice; the exact 8-tap/~1min production shape; three "yes" taps producing one confirmation; a yes→no change genuinely freeing the spot (two system messages, not suppressed); and a manually-inserted second live reminder message (`_resend_reminder`) making a same-answer response non-duplicate.

## Connections

- Uses: `test_notification_reminder_flow.py` (imports `PATCHES`, `_config_with_repeat`, `_enable_auto_notify`, `_seed_coach_and_student`, `_seed_instance`, `_seed_replacement_candidates` directly), `padel_app.services.notification_service` (`respond_to_reminder`, `send_class_reminders`, `_get_or_create_direct_conversation`), `padel_app.models.vacancy.Vacancy`, `padel_app.models.presences.Presence`, `padel_app.models.notification_event.NotificationEvent`, `padel_app.models.messages.Message`, `padel_app.sql_db.db`; the `app` fixture from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): `test_notification_integration.py` (adjacent response-handling and idempotency behaviour on the same `respond_to_*` notification pipeline).
