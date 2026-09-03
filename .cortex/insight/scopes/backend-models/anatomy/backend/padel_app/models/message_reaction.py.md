---
path: backend/padel_app/models/message_reaction.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 22
size_tokens: 218
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "bcdd9438d81196c5f9b8f316a6a312ddb98ede52aa1a5e72a2ee5d4a30339a38"
---

## Purpose

An emoji reaction on a Message by a User, unique per (message_id, user_id, emoji).

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/messages.py: Message.reactions back_populates message, cascade delete-orphan
- backend/padel_app/serializers/message.py: serialize_message reads message.reactions into the reactions list
