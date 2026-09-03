---
path: backend/padel_app/tests/test_notification_localization.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 155
size_tokens: 1456
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3ff8b8c3f4781514f34d89d8473ce3766ea63feb234bf9bdfe048fa176e2aabd"
---

## Purpose

PAD-38 tests pinning that reminder/invite/waiting-list message placeholders always render fully substituted in Portuguese: `{weekday}` must render as a Portuguese weekday name (e.g. `"quarta-feira"`) rather than an English `strftime("%A")` string, and `{level}` on a level-less instance must render as an empty string rather than the literal filler word `"this"`. The single test seeds a coach/student, a lesson instance with no level, and a custom PT `NotificationConfig.message_templates["reminder"]`, calls `send_class_reminders`, and asserts the persisted `Message.text` contains the expected PT weekday, none of the seven English weekday names, no `"aula de this"` artifact, none of the raw `{level}`/`{weekday}`/`{time}`/`{name}` tokens, and no double-space gap left by an empty `{level}` substitution. Docstring notes this is a tactical fix; full locale-driven i18n is deferred to PAD-39 (`test_notification_i18n.py`).

## Connections

- Uses: `test_notification_reminder_flow.py` (imports `_seed_coach_and_student` and `PATCHES` directly rather than redefining them), `padel_app.services.notification_service.send_class_reminders`, `padel_app.models.notification_config.NotificationConfig`, `padel_app.models.lessons.Lesson`, `padel_app.models.lesson_instances.LessonInstance`, `padel_app.models.clubs.Club`, `padel_app.models.Association_CoachLessonInstance`, `padel_app.models.Association_PlayerLessonInstance`, `padel_app.models.messages.Message`, `padel_app.sql_db.db`; the `app` fixture from `conftest.py` (scope `backend-tests-a`).
- Used by: —
- Semantically related (not imports): `test_notification_i18n.py` (same weekday/filler rendering rule, PAD-39 vs this file's PAD-38; the two files independently seed near-identical fixtures).
