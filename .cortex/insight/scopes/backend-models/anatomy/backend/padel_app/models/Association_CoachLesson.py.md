---
path: backend/padel_app/models/Association_CoachLesson.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 68
size_tokens: 532
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "361db2005e5f30e91858b5ab9c083589fc4b40859744eefcb83e351232bbde7d"
---

## Purpose

Junction linking a Coach to a Lesson (the recurring class template) -- how a class can have more than one co-teaching coach.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/lessons.py: Lesson.coaches_relations back_populates this class
- backend/padel_app/models/coaches.py: Coach.lessons_relations back_populates this class
