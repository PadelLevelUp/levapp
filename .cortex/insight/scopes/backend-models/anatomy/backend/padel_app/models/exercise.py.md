---
path: backend/padel_app/models/exercise.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 3
size_lines: 183
size_tokens: 1422
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2a3f6389cf2b8dee2d8ece2ffe18249dacff10f9f25c4248df23dc0f3b7613af"
---

## Purpose

The training-content domain: Exercise (a typed drill -- attack/defense/serve/return/volley/transition/warm_up/footwork/custom, difficulty 1-5, `level_ids` JSON targeting CoachLevel ids, `diagram` JSON holding the court-diagram editor payload) and ExerciseGroup (a named collection of exercises). Both are owned by one Coach (`owner_coach_id`) but can be shared read-only with other coaches via the Association_CoachExercise / Association_CoachExerciseGroup owner/follower role tables.

## Main players

- **exercise_group_exercises** (lines 13-18, supporting): module-level plain secondary Table for the Exercise<->ExerciseGroup many-to-many -- the ONLY M2M in this scope that uses a bare secondary table instead of an id-bearing Association_* model.
- **Exercise** (lines 21-114, critical): the drill entity: type/difficulty/level_ids/diagram/notes, owner_coach, coaches_relations (sharing), groups (M2M).
- **ExerciseGroup** (lines 117-183, critical): a named collection of exercises; same owner + sharing-relations shape as Exercise.

## Insights

- Exercise<->ExerciseGroup is a genuine plain-secondary-table many-to-many (`exercise_group_exercises`), unlike every other cross-entity link in this scope (Coach<->Club, Coach<->Player, Player<->Lesson, etc.), which all use an id-bearing Association_* model instead. That inconsistency means this relation cannot carry extra columns or be independently queried/edited the way the others can.
- `level_ids` is a JSON array of CoachLevel ids with no FK/constraint enforcing referential integrity -- a deleted CoachLevel silently leaves dangling ids here; nothing in this file validates or cleans them up.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/coaches.py: owned_exercises/owned_exercise_groups back_populates owner_coach
- backend/padel_app/models/Association_CoachExercise.py: back_populates exercise
- backend/padel_app/models/Association_CoachExerciseGroup.py: back_populates exercise_group
- backend/padel_app/models/lesson_instance_training.py: FK exercise_id -- the exercises planned for one LessonInstance
- backend/padel_app/serializers/training.py: serialize_exercise/serialize_exercise_group read Exercise/ExerciseGroup attributes directly (duck-typed)

## Query pointers

- If you need to add a new Exercise attribute, also read: serializers/training.py (the camelCase mapping) and the frontend training/diagram editor.
- If you need to change sharing/permissions, read first: Association_CoachExercise.py / Association_CoachExerciseGroup.py (the owner/follower role enum), then: coaches.py (exercise_relations / exercise_group_relations).
