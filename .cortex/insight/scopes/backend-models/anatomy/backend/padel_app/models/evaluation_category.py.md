---
path: backend/padel_app/models/evaluation_category.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 86
size_tokens: 653
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "bc65e22210f69702199ad49501fcac861d212aa286951156f9c2d6646472210d"
---

## Purpose

A coach-defined scoring rubric category (name, scale_min/scale_max), e.g. "Forehand" scored 1-10. `frontend_dict()` returns its camelCase API shape directly from the model (bypassing a dedicated serializer function, unlike most other entities in this scope).

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/coaches.py: Coach.evaluation_categories back_populates coach
- backend/padel_app/models/evaluation_entry.py: entries back_populates category, cascade delete-orphan
