---
path: backend/padel_app/models/notification_event.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 49
size_tokens: 550
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d39e5dafc897a0d1706eb0c277bb02fbf40a7e4f951ab69502b7423ebe90108c"
---

## Purpose

One row per invite SENT to a student for a class instance (type manual/auto, round_number, status sent/confirmed/expired/queued, optional message_id for the delivering Message, optional vacancy_id). A student can accumulate several rows across rounds/re-invites; serializers/lesson.py's `dedupe_invitation_events` collapses these to one row per student for display (PAD-72, documented there, not here).

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/lesson_instances.py: lesson_instance_id FK (no back_populates)
- backend/padel_app/models/players.py: player_id FK (no back_populates)
- backend/padel_app/models/coaches.py: coach_id FK (no back_populates)
- backend/padel_app/models/messages.py: message_id FK (no back_populates) -- the delivering message
- backend/padel_app/models/vacancy.py: vacancy relationship back_populates notification_events
- backend/padel_app/serializers/lesson.py: _invitation_precedence/dedupe_invitation_events rank and collapse rows of this model (PAD-72)
