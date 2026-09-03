---
path: backend/padel_app/models/evaluation_entry.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 95
size_tokens: 758
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "07d49ac59811825aec6bc8c75b9109004c685515d85b20ffb30de790c08ff34b"
---

## Purpose

One scored evaluation entry (score, optional comment, evaluated_at) tied to one Association_CoachPlayer and one EvaluationCategory. Follows the same append-only-history convention as player_level_history.py: nothing here is ever updated in place, and `Association_CoachPlayer.current_evaluations` derives 'the current score per category' by picking the most recently evaluated row per category.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/Association_CoachPlayer.py: coach_player back_populates evaluations; current_evaluations picks latest per category_id
- backend/padel_app/models/evaluation_category.py: category back_populates entries
