---
path: backend/padel_app/models/vacancy.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 71
size_tokens: 690
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "574c8b8b964de6dce76c3fd8b17ca6020f51255155c64773cc6ca077645ba736"
---

## Purpose

Vacancy is an open (or being-filled) spot on a LessonInstance, created when a player leaves/declines or a class is created with unfilled slots. Tracks `status` (open/filled/expired) separately from `approval_status` (the semi-automatic-mode gate: not_required/pending/approved/dismissed), `current_round_number`/`current_batch_number` (drives the out-of-scope round-based invitation engine), `invite_not_before` (delay approved-but-not-yet-open invites), and `last_activity_at` (checked against notification_config.py's restrictions.maxInactiveTime by an out-of-scope service).

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/lesson_instances.py: lesson_instance_id FK (no back_populates)
- backend/padel_app/models/players.py: original_player_id/filled_by_player_id FKs (no back_populates)
- backend/padel_app/models/coach_levels.py: level_id FK (no back_populates)
- backend/padel_app/models/notification_event.py: notification_events back_populates vacancy
- backend/padel_app/models/replacement_approval_prompt.py: unique vacancy_id FK -- one prompt per vacancy (one-way, not back_populated here)
