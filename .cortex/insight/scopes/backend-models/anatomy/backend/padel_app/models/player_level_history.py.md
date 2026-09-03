---
path: backend/padel_app/models/player_level_history.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 89
size_tokens: 689
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7ec4b342377564109e28712986e9584e0bcbbb2f33ce6ea397603d2b8674ce8d"
---

## Purpose

Append-only per-(player, coach) level-assignment log. `Player.level` reads `level_history[0]` (ordered `desc(assigned_at)`) to get the 'current' level rather than a mutable field -- the same append-only-history convention evaluation_entry.py/current_evaluations uses for scores.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/players.py: Player.level_history back_populates player, ordered desc(assigned_at); Player.level reads [0]
- backend/padel_app/models/coaches.py: Coach.player_levels back_populates coach
- backend/padel_app/models/coach_levels.py: level relationship (no back_populates)
