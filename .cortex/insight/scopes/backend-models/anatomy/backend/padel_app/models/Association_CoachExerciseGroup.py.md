---
path: backend/padel_app/models/Association_CoachExerciseGroup.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 76
size_tokens: 672
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f008abc93a30636c9bb969ef5523bf1b5d7b49f5a73bdd686ea2e3692b946df8"
---

## Purpose

Same owner/follower sharing pattern as Association_CoachExercise.py, but for ExerciseGroup instead of a single Exercise.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/exercise.py: ExerciseGroup.coaches_relations back_populates this class
- backend/padel_app/models/coaches.py: Coach.exercise_group_relations back_populates this class
