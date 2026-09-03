---
path: backend/padel_app/modules/api.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 212
size_tokens: 1672
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "718f26f23fb6c71e37c6510bf313e96d876474258b75b570186d8a30af18e512"
---

## Purpose

Generic model-CRUD blueprint (`/api`) backing the legacy Jinja admin editor (`modules/editor.py`): routes operate on any model looked up by name in `padel_app.models.MODELS`, with no service layer, ownership scoping, or business validation — `create`, `edit`, `delete`, `query`, `remove_relationship`, `modal_create_page`, `download_csv`, `upload_csv_to_db`, and an `image_by_id` redirect to cloud storage. A `before_request` hook (`require_admin`, added under PAD-88) resolves the caller via `_resolve_caller` (accepts either a Flask-Login session or an optional JWT, since this blueprint serves both the legacy pages/JS and JWT-parity callers like `editor_api.py`) and rejects with 401/403 unless the caller is an admin or superadmin. The header comment records that before PAD-88 this blueprint had no guard at all — any anonymous caller could create/edit/delete/dump/CSV-export every model in the app.

## Connections

- Uses: `padel_app.model.Image` for the image-redirect route; `padel_app.models` (`MODELS`, `User`); `padel_app.tools.tools` for CSV export/import (`create_csv_for_model`, `upload_csv_to_model`); `flask_login.current_user` and `flask_jwt_extended` (`get_jwt_identity`, `verify_jwt_in_request`) for the dual-auth guard
- Used by: `padel_app/modules/__init__.py`: `register_blueprints` registers `api.bp`; `padel_app/modules/editor.py` (same scope) and its templates issue AJAX/form calls into these routes
