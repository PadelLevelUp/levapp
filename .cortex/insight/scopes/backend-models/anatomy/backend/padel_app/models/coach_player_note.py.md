---
path: backend/padel_app/models/coach_player_note.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 87
size_tokens: 648
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "057db153eed92c7a845d8a7b7e13eaf0880963dde3e4a53945d9bf63ad9d1e2f"
---

## Purpose

One strength- or weakness-typed free-text note, attached to a single Association_CoachPlayer row (i.e. scoped to one coach's relationship with one player, not to the player globally).

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/Association_CoachPlayer.py: coach_player relationship back_populates notes_list; strengths/weaknesses properties filter this by type
