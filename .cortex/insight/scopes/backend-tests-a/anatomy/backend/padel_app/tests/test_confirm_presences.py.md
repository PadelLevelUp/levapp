---
path: backend/padel_app/tests/test_confirm_presences.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 198
size_tokens: 1958
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b12b1c0a32db726d86bca503e4506d8dd0b6da933475aa64787a04291a5ec648"
---

## Purpose

PAD-64 — spec `attendance.presence`: attendance can be saved for a
recurring class occurrence that has not yet been materialized into a
`LessonInstance`. The frontend's `ClassInstance` payload distinguishes a
projected Lesson occurrence (`originalId` = Lesson id, event `id` =
`"lesson-<id>-<date>"`) from a materialized instance (`originalId` =
LessonInstance id, event `id` = `"lessoninstance-<id>"`). The bug: the old
branch keyed on `'parentClassId' in keys()`, but `parentClassId` is added
by `serialize_class_instance` whenever the detail endpoint resolves to an
instance — even when the frontend's stale event/`originalId` is still the
recurring Lesson (e.g. materialized after the calendar loaded) — routing a
Lesson id into `LessonInstance.get_or_404` and 404ing "Failed to save
attendance". The fix branches on the event id PREFIX instead. Pins three
cases: a fresh projected recurring occurrence with no `parentClassId`
materializes and records; the exact stale-payload shape (`lesson-...` id
+ Lesson `originalId` + a `parentClassId` present) also materializes and
records correctly (the regression case); and a genuine materialized-
instance event records on that instance without creating a duplicate.

## Connections

- Uses: `padel_app.services.lesson_service`
  (`confirm_presences_service`, `get_or_materialize_instance`); models
  `User`, `Coach`, `Player`, `Club`, `Association_CoachClub`,
  `Association_CoachLesson`, `Association_PlayerLesson`, `Lesson`,
  `LessonInstance`, `Presence`.
- Used by: (none — leaf test file)
- Semantically related (not imports): `confirm_presences_service` is also
  exercised by `test_boolean_coercion.py`'s
  `TestAddPresencesPreservesReminderState` and `TestPad69NoFollowupAfterDecline`,
  but those cover its boolean-field round-trip rather than the
  Lesson-vs-LessonInstance id-routing bug this file pins.
