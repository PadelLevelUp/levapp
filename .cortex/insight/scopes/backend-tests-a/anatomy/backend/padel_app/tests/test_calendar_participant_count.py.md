---
path: backend/padel_app/tests/test_calendar_participant_count.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 164
size_tokens: 1414
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3908de72ee3dc4f5e968a3cbe6f8cd0c5bfb13d3f39f635ab97f2363d78a9413"
---

## Purpose

PAD-71 — pins that the calendar's participant count is EFFECTIVE filled
spots (spec `calendar.view` rules 8-10): enrolled players minus everyone
who declined (`Presence.status == "absent"`); players who haven't
answered yet still occupy their spot. `LessonInstance.effective_filled_spots`
is asserted as the single source of truth shared by the calendar payload,
the class-detail capacity field, and the invitation engine's capacity
checks (`_effective_filled_spots` in `notification_service`) —
`test_calendar_event_matches_invitation_engine_capacity` asserts both
paths return the identical number. Also pins that a non-materialized
`Lesson` template (no presences yet) falls back to reporting enrolment
count via `lesson.players_relations`.

## Connections

- Uses: models `User`, `Coach`, `Player`, `Club`, `Lesson`,
  `LessonInstance`, `Presence`, `Association_CoachLessonInstance`,
  `Association_PlayerLessonInstance`;
  `padel_app.serializers.calendar_event.serialize_calendar_event`;
  `padel_app.services.notification_service._effective_filled_spots`.
- Used by: (none — leaf test file)
- Semantically related (not imports): `LessonInstance.effective_filled_spots`
  is exercised here as the shared capacity source of truth; the same
  concept underlies invitation-engine eligibility tests in
  `test_effective_level_resolution.py` and `test_level_ladder_ordering.py`
  (structural vacancy checks), though those cover level eligibility rather
  than raw seat counting.
