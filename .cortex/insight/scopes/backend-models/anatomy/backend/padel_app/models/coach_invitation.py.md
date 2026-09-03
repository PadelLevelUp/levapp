---
path: backend/padel_app/models/coach_invitation.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 105
size_tokens: 770
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e381c51d5a849861c8f68f2852d44b2d2a2d560ebbeae4f8921f279f25c7c96f"
---

## Purpose

Token-based invite flow to join a Club as a coach: a random `token`, optional `email`, `status` (pending/accepted/revoked/expired) and `expires_at`. Structurally near-identical to player_invitation.py, just targeting a Club instead of a single Player.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/clubs.py: club FK/relationship
- backend/padel_app/models/coaches.py: invited_by_coach FK/relationship
- backend/padel_app/models/player_invitation.py: same token/status/expires_at invite shape, different target entity
