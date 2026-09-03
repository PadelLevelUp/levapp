---
path: backend/padel_app/modules/editor_api.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 177
size_tokens: 1278
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6b8120c1336e5764cd3d99c1b331654c07dfd2a764ed5c1f4093e3d94fbc8a9a"
---

## Purpose

JSON-API counterpart to the legacy Jinja editor (`/api/editor`), superadmin-only (`require_superadmin` on `before_request` verifies a JWT then checks `user.is_superadmin`, a strictly higher bar than `modules/api.py`'s plain-admin guard). Exposes a generic REST-ish CRUD+introspection surface over any model in `MODELS`: `list_models` (searchable/list-column metadata per model), `model_schema` (create-form field definitions), `model_options` (id/label pairs for select inputs), `list_records` (paginated, optionally search-filtered), `get_record`, `create_record`, `update_record`, `delete_record`. `serialize` converts `date`/`datetime` to ISO strings and `Decimal` to `float` for JSON safety.

## Connections

- Uses: `padel_app.models` (`MODELS`, `User`); `padel_app.sql_db.db`; `flask_jwt_extended` (`get_jwt_identity`, `jwt_required` import present but the actual guard is manual `verify_jwt_in_request` in `before_request`, not a per-route decorator)
- Used by: `padel_app/modules/__init__.py`: `register_blueprints` registers `editor_api.bp`; no other in-scope backend file calls into its routes directly (a distinct frontend admin surface, outside this scope, is presumably the actual caller)
