---
path: backend/padel_app/models/Association_PlayerClub.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 70
size_tokens: 531
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b44e29fbe21e3d8e2153c58570c68add3dabae8b078cebf7c1d02421564f4034"
---

## Purpose

Junction linking a Player to a Club (many-to-many club membership).

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/clubs.py: Club.players_relations back_populates this class
- backend/padel_app/models/players.py: Player.clubs_relations back_populates this class
