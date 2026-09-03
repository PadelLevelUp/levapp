---
path: backend/padel_app/models/Association_CoachPlayer.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 96
size_tokens: 866
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "352f044b4b3d9099f8e5c5fccf6f58e0f5e0dcdc91d8515c49276a34bb8cee25"
---

## Purpose

The coach's roster entry for one player: carries `level_id` (the per-coach CoachLevel, distinct from any global notion of level), `side` (playing side) and free-text `notes`, and owns that player's strength/weakness notes and evaluation history via cascade. `strengths`/`weaknesses` filter `notes_list` by type; `current_evaluations` picks the most recent EvaluationEntry per category (append-only history, one entry per (category, date)). Despite L1's 'low' centrality ranking (few import edges), this is the real hub of the day-to-day coaching workflow -- players.py's `coach_player_info()` is built almost entirely from this row.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/coach_player_note.py: CoachPlayerNote.coach_player back_populates notes_list
- backend/padel_app/models/evaluation_entry.py: EvaluationEntry.coach_player back_populates evaluations
- backend/padel_app/models/coach_levels.py: CoachLevel.coach_player_relations back_populates level
- backend/padel_app/models/players.py: Player.coaches_relations back_populates this class; coach_player_info() reads level_id/side/notes from here
- backend/padel_app/models/coaches.py: Coach.players_relations back_populates this class
