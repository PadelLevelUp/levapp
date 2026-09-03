---
path: backend/padel_app/services/training_service.py
extracted_at: 2026-09-03T13:58:46Z
extraction_level: 2
size_lines: 239
size_tokens: 1874
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a95bb41abc2a8f540470459aa503614c102a6ce782b52a2ebaba6034e9c52773"
---

## Purpose

CRUD for the training-plan domain: `Exercise` and `ExerciseGroup` (both
owner-scoped via `Association_CoachExercise`/`Association_CoachExerciseGroup`
role="owner" rows — a coach can only edit/delete what they own, though
"followed" exercises are also readable), and
`confirm_training_service`, which materializes a `LessonInstance` (if
needed, via `lesson_service.get_or_materialize_instance`) and replaces
its full set of `LessonInstanceTraining` rows atomically (delete-then-
insert, not diffed).

## Connections

- Uses: `padel_app.sql_db.db`; `padel_app.models.exercise`
  (`Exercise`, `ExerciseGroup`); `padel_app.models.Association_CoachExercise`;
  `padel_app.models.Association_CoachExerciseGroup`;
  `padel_app.models.lesson_instance_training.LessonInstanceTraining`;
  `services/lesson_service.py` (`get_or_materialize_instance`, imported
  lazily inside `confirm_training_service`).
- Used by: training-plan routes (outside this scope, in the API layer).

## Insights

- Ownership vs. read access is a real distinction here: `get_exercises_for_coach`/
  `get_exercise_groups_for_coach` return every exercise/group the coach
  has ANY association row for (owned or followed), but every
  mutation (`update_exercise_service`, `delete_exercise_service`, and
  the group equivalents) requires an association with `role="owner"`
  specifically — a followed exercise is read-only to a non-owning coach.
- `confirm_training_service` accepts either an already-materialized
  instance (`parentClassId` present) or a virtual lesson+date pair,
  materializing on demand — the same lazy-materialization entry point
  used elsewhere in the codebase for attendance/presence writes.
