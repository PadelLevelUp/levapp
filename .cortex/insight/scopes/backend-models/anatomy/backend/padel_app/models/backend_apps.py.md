---
path: backend/padel_app/models/backend_apps.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 139
size_tokens: 1074
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2f7da8da2c2486fd67bcbb1d0dc3a8c321bdebf5c2303935afc433c598c5bca0"
---

## Purpose

Backend_App represents one installed/available 'app' surfaced by the generic admin editor UI (name, accent color, icon). `app_model_name` is the key used to resolve which model the app points at; `style`/`url` are hybrid_property helpers for rendering; `image_object_key`/`image_url` fall back to a default icon path when no Image is attached.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/model.py: image_id FK to model.py's Image/Imageable pair (images.id), via relationship("Image")
