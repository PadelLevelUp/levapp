---
path: backend/padel_app/models/Association_PlayerLessonInstance.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 79
size_tokens: 614
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "9f6671a6a09b1d8080c5957fbc854a5224fbd60292de6670f5ba4627de7719b7"
---

## Purpose

Junction linking a Player to one concrete LessonInstance occurrence -- the per-occurrence enrolment that `LessonInstance.effective_filled_spots` counts and that Presence rows are created against.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/lesson_instances.py: LessonInstance.players_relations back_populates this class; len(players_relations) feeds effective_filled_spots
- backend/padel_app/models/players.py: Player.lesson_instances_relations back_populates this class
