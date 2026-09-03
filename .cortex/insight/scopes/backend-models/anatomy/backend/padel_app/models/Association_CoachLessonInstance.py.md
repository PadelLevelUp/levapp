---
path: backend/padel_app/models/Association_CoachLessonInstance.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 80
size_tokens: 609
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d65f625638fc04cb98d1a29f0965e382f02c46d4f6e35ee44fc549af7b399866"
---

## Purpose

Junction linking a Coach to one concrete LessonInstance occurrence -- lets a single scheduled class (not the whole recurring template) have a substitute or extra coach assigned for that occurrence only.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/lesson_instances.py: LessonInstance.coaches_relations back_populates this class
- backend/padel_app/models/coaches.py: Coach.lesson_instances_relations back_populates this class
