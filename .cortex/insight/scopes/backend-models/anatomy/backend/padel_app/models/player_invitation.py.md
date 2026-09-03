---
path: backend/padel_app/models/player_invitation.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 98
size_tokens: 699
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "1c8ec38a9518e38eb53f25abd8658443b41adf8d52352e6c9afe03c9ced65ffb"
---

## Purpose

Token-based self-registration invite for a single Player -- the Player-scoped counterpart to coach_invitation.py, with the same token/status/expires_at shape but no club context.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/players.py: player relationship (no back_populates)
- backend/padel_app/models/coaches.py: invited_by_coach relationship (no back_populates)
- backend/padel_app/models/coach_invitation.py: same token/status/expires_at invite shape, different target entity
