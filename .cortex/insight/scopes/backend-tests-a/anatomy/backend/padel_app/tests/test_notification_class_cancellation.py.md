---
path: backend/padel_app/tests/test_notification_class_cancellation.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 194
size_tokens: 1889
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "19a896cb62bb579cea9f1b57b9b7111fa8082de1a0eb9d80b130a2ca6b3e0d01"
---

## Purpose

PAD-75 — when a coach removes/cancels a scheduled class that has enrolled
students, each enrolled student must get an in-app cancellation
notification (a system message in their coach<->student conversation),
via the same channel as other class notifications; no message is sent
when the class has no enrolled students. Pins: cancelling a class with N
enrolled students sends exactly N cancellation messages (identified by
`msg_metadata.get("classCancellation")`), each sent by the coach with
non-blank text, one per distinct student conversation; cancelling an
empty class sends zero; and the cancellation copy is localized to the
COACH's locale (a pt-language coach's students get PT copy — checks the
substring "cancelada", unique to the Portuguese template).

## Connections

- Uses: `padel_app.services.lesson_service` (`remove_class_service`,
  patched `publish`/`send_push_notification`); models `User`, `Coach`,
  `Player`, `CoachLevel`, `Lesson`, `LessonInstance`, `Club`,
  `Association_CoachLessonInstance`, `Association_PlayerLessonInstance`,
  `Message`.
- Used by: (none — leaf test file)
- Semantically related (not imports): its docstring says the seed
  helpers "mirror `test_notification_integration.py`" (outside this
  scope); shares the "notification must never be blank/must resolve to a
  real template" concern with
  `test_notification_blank_template_fallback.py`, though that file covers
  template-blank fallback rather than the cancellation trigger itself.
