---
path: backend/padel_app/models/blocked_user.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 20
size_tokens: 188
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "9752a47bd8a02caf14041ae66b75e33442878622435fbcb6882caea9f4237446"
---

## Purpose

Records that one User has blocked another (blocker_id/blocked_id, unique pair). Has the Model mixin's created_at/updated_at but never overrides get_create_form/display_all_info, so -- unlike TokenBlocklist, which is excluded for a documented compatibility reason -- it is simply never registered in models/__init__.py's MODELS dict, i.e. not editable through the generic admin UI by design, not by bug workaround.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/users.py: blocker/blocked both FK users.id via two separate relationship() targets on the same User class
