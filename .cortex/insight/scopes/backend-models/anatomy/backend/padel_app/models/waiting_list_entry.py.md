---
path: backend/padel_app/models/waiting_list_entry.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 44
size_tokens: 349
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "34ec07b291c3e525a51b1c98bb78ae6c9c25034bc37b6cec19c80684fbea25a0"
---

## Purpose

A player's join to the waitlist for one specific LessonInstance (unique per instance+player), optionally sourced from a StandingWaitingListEntry credit pool via `standing_entry_id`.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/lesson_instances.py: lesson_instance_id FK (no back_populates)
- backend/padel_app/models/players.py: player_id FK (no back_populates)
- backend/padel_app/models/standing_waiting_list_entry.py: standing_entry_id FK -- optional credit-pool source
