---
path: backend/padel_app/tests/test_class_detail_visibility.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 232
size_tokens: 2025
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ad16dbfdc0614df950580ec6ccf237a4ef49e520b11233b8609b1c971863cefe"
---

## Purpose

PAD-36 — role-based visibility of the class detail payload (spec
`classes.detail-visibility`). Fixture `class_scenario` builds one coach
and two students (Alice present, Bob absent-unjustified with an open-spot
`NotificationEvent` sent to him) on one lesson instance. Pins: a coach
sees full detail (all participants, all presences, Bob's invitation);
a student (Alice) sees ONLY her own participation — Bob's id must not
appear in `participants`, `presences`, or `invitations`, while shared
non-sensitive class info (name, coachId) is still visible; `GET
/api/app/lesson_instance/<id>` also scopes presences to the caller; and
`GET /api/app/lesson_instance/<id>/presences` requires authentication
(401 anonymous).

## Connections

- Uses: models `User`, `Coach`, `Player`, `Club`,
  `Association_CoachClub`, `Lesson`, `LessonInstance`, `Presence`,
  `NotificationEvent`, `Association_CoachLessonInstance`,
  `Association_PlayerLessonInstance`; `flask_jwt_extended.create_access_token`.
- Used by: (none — leaf test file)
- Semantically related (not imports): the "student sees only own data"
  principle here is the same one `test_frontend_api_authz.py` pins at the
  route-authorization level (`test_other_coach_cannot_read_calendar_event`,
  etc.) and `test_messaging_report_block_scope.py` pins for conversation
  scoping.
