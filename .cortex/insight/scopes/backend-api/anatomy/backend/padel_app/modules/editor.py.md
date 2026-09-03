---
path: backend/padel_app/modules/editor.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 72
size_tokens: 552
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b5eae3efb1f82b2df8d8373764c8c774c5b0c24740b15760bef2b7fe9b74e02f"
---

## Purpose

Legacy Jinja admin-editor blueprint (`/editor`), guarded end-to-end by `auth_tools.admin_required` on `before_request`: `index` lists registered `Backend_App` entries, `display_all`/`display` render paginated list/detail views for any model in `MODELS`, `create` renders and submits a generic create form, and `documentation` renders (or serves as JSON) the auto-generated model schema doc. Every route reads/writes through generic per-model instance methods (`get_display_all_data`, `get_create_form`, etc.) rather than model-specific logic, so this file itself carries no business rules — it is UI scaffolding over `modules/api.py`'s CRUD blueprint.

## Connections

- Uses: `padel_app.models` (`Backend_App`, `MODELS`); `padel_app.tools.auth_tools.admin_required`; `padel_app.tools.documentation_tools.build_models_doc`
- Used by: `padel_app/modules/__init__.py`: `register_blueprints` registers `editor.bp`; `padel_app/modules/main.py`'s root route redirects here; its templates POST into `modules/api.py`'s `/api/*` routes for the actual create/edit/delete actions
