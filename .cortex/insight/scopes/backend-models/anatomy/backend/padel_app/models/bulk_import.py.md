---
path: backend/padel_app/models/bulk_import.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 43
size_tokens: 353
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3fb21ec2d0da7a38c1cb61ae01ca4579871a898a1bcf4c22975409543903a174"
---

## Purpose

Tracks one CSV/bulk-import run performed by a coach: filename, status (active/reverted), a JSON-encoded human summary (e.g. {"Players": 2, "Classes": 1}), and a JSON-encoded map of the record ids it created per table -- the latter is what a revert operation reads to know exactly which rows to delete.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`
