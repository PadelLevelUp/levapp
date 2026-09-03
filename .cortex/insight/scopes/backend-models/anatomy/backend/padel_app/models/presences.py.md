---
path: backend/padel_app/models/presences.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 87
size_tokens: 758
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0fefc7c269715324b94272a5d66e3ff3aa12a0cdd1fd7bfd856a9a5127009690"
---

## Purpose

Presence is one row per (player, lesson_instance): the attendance/RSVP state that lesson_instances.py's `effective_filled_spots`/`confirmed_spots` iterate over. `status` is present/absent/None (unanswered still holds the spot); `justification` only means anything when absent; `invited`/`confirmed`/`validated` are booleans; `late_cancellation` (PAD-43) is set when a student cancels at or after the coach's configured deadline (the spot still frees, but the cancellation is flagged).

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/players.py: player relationship back_populates presences, cascade delete-orphan
- backend/padel_app/models/lesson_instances.py: lesson_instance relationship back_populates presences; effective_filled_spots/confirmed_spots count these rows
- backend/padel_app/serializers/presence.py: serialize_presence reads this model's fields directly (duck-typed)
