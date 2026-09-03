---
path: backend/padel_app/models/lesson_instance_training.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 21
size_tokens: 124
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "df0f66825a07c47f51fc011b88b463a3c8aead74847e049df4e5f5cb6f542969"
---

## Purpose

Pure junction table linking one LessonInstance occurrence to the Exercises planned for it, with a composite primary key (lesson_instance_id, exercise_id) and no surrogate id. It is the ONLY cross-entity link table in this scope that is a plain `db.Model` -- no `model.Model` mixin, no `get_create_form`, no editor registration -- every other M2M link in this scope is an id-bearing Association_* model instead. Read directly by serializers/lesson.py's `serialize_class_instance` (queried by lesson_instance_id, mapped to `plannedExerciseIds`).

## Connections

Uses:
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/lesson_instances.py: FK lesson_instance_id, no relationship() declared either side
- backend/padel_app/models/exercise.py: FK exercise_id, no relationship() declared either side
- backend/padel_app/serializers/lesson.py: serialize_class_instance queries this table directly by lesson_instance_id (function-local import)
