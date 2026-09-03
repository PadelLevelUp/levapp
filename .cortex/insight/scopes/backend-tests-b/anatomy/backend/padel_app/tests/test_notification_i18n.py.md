---
path: backend/padel_app/tests/test_notification_i18n.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 235
size_tokens: 2037
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "545f2db5a308c8c6efcea23d33c4de01b44274f2cbc41ebf553a4a6942e7afe6"
---

## Purpose

Integration tests (PAD-39, PAD-38) for locale-aware rendering of the class reminder message produced by `notification_service.send_class_reminders`. Seeds a coach with `user.language` set to `"pt"` or `"en"` plus a student and a future lesson instance, sends the reminder, then asserts the weekday token in the persisted `Message` text is rendered via Babel in the coach's locale (`quarta-feira` vs `Wednesday`) with no leaked English/PT cross-contamination, no raw `{weekday}`/`{level}` placeholders, and no stray `"this"` filler word. Also pins that a `User` created with no explicit `language` defaults to `"pt"`, and that an instance with no assigned level renders its reminder without the `"this"` filler or unresolved tokens.

## Connections

- Uses: `padel_app.services.notification_service` (`send_class_reminders`, patched via `PATCHES` on its `publish`/`send_push_notification` module attributes), `padel_app.models.users.User` (`language` field/default), `padel_app.models.coaches.Coach`, `padel_app.models.players.Player`, `padel_app.models.lessons.Lesson`, `padel_app.models.lesson_instances.LessonInstance`, `padel_app.models.coach_levels.CoachLevel`, `padel_app.models.clubs.Club`, `padel_app.models.Association_CoachLessonInstance`, `padel_app.models.Association_PlayerLessonInstance`, `padel_app.models.messages.Message`, `padel_app.sql_db.db`; the `app` fixture from `conftest.py` (scope `backend-tests-a`, not imported directly by this file — provided by pytest fixture injection).
- Used by: —
- Semantically related (not imports): `test_notification_localization.py` (same weekday/level-filler rendering rule, reuses `test_notification_reminder_flow.py`'s seed helpers instead of its own); `test_notification_reminder_flow.py` (this file's docstring says its seed helpers were "adapted from" that file's).
