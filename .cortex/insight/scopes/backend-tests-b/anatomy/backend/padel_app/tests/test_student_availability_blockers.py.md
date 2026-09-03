---
path: backend/padel_app/tests/test_student_availability_blockers.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 431
size_tokens: 4083
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7578759d4cbb77edc3879812b8707ab6889417de6c1acc1899be09ae8581795b"
---

## Purpose

PAD-28 tests that a student's `CalendarBlock` (availability blocker) suppresses AUTOMATIC class invitations, and PAD-107 tests that it also suppresses MANUAL ones — a blocked student must never be solicited by any path. Pins `notification_service.get_eligible_students`: a blocker overlapping the class window (and marked `blocks_auto_invitations=True`) filters the student out of eligibility; a non-overlapping blocker, or one not marked `blocks_auto_invitations`, does not suppress; a WEEKLY recurring blocker suppresses the matching weekday occurrence (frontend/JS `getDay()` weekday convention mapped via `build_rrule`). PAD-107 section: `send_manual_notifications` skips a blocked (but enrolled) student while still notifying an available classmate (no `NotificationEvent`, no `Message`, no push); `send_class_reminders` reports the blocked student under `result["blocked"]` with their name rather than silently dropping them; the delivery choke point `_send_system_message` itself refuses to send a `notification_invite`/reminder-type message to a blocked user (returns `None`) even called directly — a backstop below the invitation engine — but does NOT block a plain `"text"` chat message from the coach (unavailability silences class solicitations, not the coach's chat); `student_availability_service.blocked_players_for_instance` returns only `{playerId, name, cause}` per blocked student — no blocker title/description/hours leak into the coach-facing payload (`cause` disambiguates PAD-107 unavailability-blocks from PAD-112's other blocked-reason category on the same shared array); and the `POST /api/app/notify/availability_conflicts` route is scoped to the calling coach's own roster — a stranger coach querying the same player learns nothing, not even that the player exists (empty `blocked` list, still 200).

## Connections

- Uses: `padel_app.services.notification_service` (`get_eligible_students`, `send_manual_notifications`, `send_class_reminders`, `_send_system_message`), `padel_app.services.student_availability_service.blocked_players_for_instance`, `padel_app.models.users.User`, `padel_app.models.coaches.Coach`, `padel_app.models.players.Player`, `padel_app.models.coach_levels.CoachLevel`, `padel_app.models.Association_CoachPlayer`, `padel_app.models.lessons.Lesson`, `padel_app.models.lesson_instances.LessonInstance`, `padel_app.models.clubs.Club`, `padel_app.models.Association_CoachLessonInstance`, `padel_app.models.Association_PlayerLessonInstance`, `padel_app.models.vacancy.Vacancy`, `padel_app.models.notification_config.NotificationConfig`, `padel_app.models.calendar_blocks.CalendarBlock`, `padel_app.models.NotificationEvent`, `padel_app.models.Message`, `padel_app.models.conversation_participants.ConversationParticipant`, `padel_app.sql_db.db`; `flask_jwt_extended.create_access_token` for the route-level authz test; the `app` and `client` fixtures from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): `test_student_notification_block_preferences.py` (a distinct, PAD-112 student-controlled block mechanism — notification preference flags rather than calendar unavailability — feeding the same shared coach-facing `blocked` array and `cause` field this file's `blocked_players_for_instance` test asserts on); `test_pad93_boolean_blast_radius.py::TestBlockerFlagSurvivesEventEdit` (covers `blocks_auto_invitations` surviving a calendar-event edit, the write-path counterpart to this file's read-path eligibility tests).
