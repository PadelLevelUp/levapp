---
path: backend/padel_app/models/token_blocklist.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 19
size_tokens: 122
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6e2612d34e3adbeb2f947508da6361e1f9d385949c6023c2d6626a3e0102dbea"
---

## Purpose

Plain `db.Model` (no `model.Model` mixin) -- a JWT `jti` revocation list for flask-jwt-extended logout/blocklist checks. Imported into models/__init__.py but deliberately excluded from its MODELS dict (see that file's comment): it has no get_create_form/display_all_info and would 500 the generic editor's schema endpoint if registered.

## Connections

Uses:
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models` (imported, but explicitly excluded from the MODELS registry -- see models/__init__.py's comment)
