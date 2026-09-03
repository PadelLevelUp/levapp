---
path: backend/padel_app/models/Association_CoachExercise.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 76
size_tokens: 644
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c02fdff16956207d18d07db464447c89587278020adba8f95e5c1d8185425afd"
---

## Purpose

Junction linking a Coach to an Exercise, carrying a `role` enum (owner grants edit/delete, follower is read-only via sharing). This is how one coach can share a training exercise with another coach without duplicating the row.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/exercise.py: Exercise.coaches_relations back_populates this class; Exercise.owner_coach_id is the separate FK for the true owner
- backend/padel_app/models/coaches.py: Coach.exercise_relations back_populates this class (all access, owner + follower)
