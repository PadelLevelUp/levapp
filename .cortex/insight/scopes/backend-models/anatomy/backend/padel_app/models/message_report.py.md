---
path: backend/padel_app/models/message_report.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 18
size_tokens: 178
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2d7a9cae7c1b18ddc81af178fda2a3cad37b303c24208e63c58a9363be010478"
---

## Purpose

An abuse report filed by a User (reporter) against one Message, with an optional free-text reason.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/messages.py: message relationship (no back_populates declared)
