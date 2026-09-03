---
path: backend/padel_app/models/messages.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 97
size_tokens: 824
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d6c786625b54ed5c1fc4030827d56ba0d79a40d826e738552d8839b38680bbf2"
---

## Purpose

Message is a chat message row: self-referential `reply_to` (Message.reply_to_id -> Message.id), soft-delete via `is_deleted` (the row is kept; serializers/message.py blanks the display for a deleted message), `edited` flag, and `message_type`/`msg_metadata` (JSON) supporting non-text system/notification messages -- e.g. replacement_approval_prompt.py's own docstring states its approval bundles are persisted AS a Message in the coach's Assistant conversation. `attachment` is an optional Image FK.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/conversations.py: conversation relationship back_populates messages, cascade delete-orphan
- backend/padel_app/models/users.py: sender relationship back_populates messages_sent
- backend/padel_app/models/message_reaction.py: reactions back_populates message, cascade delete-orphan
- backend/padel_app/models/notification_event.py: message_id FK (no back_populates) -- the delivering message for an invite
- backend/padel_app/models/replacement_approval_prompt.py: message_id FK -- the prompt is persisted as this Message
- backend/padel_app/serializers/message.py: serialize_message reads this model's fields, including soft-delete and reactions
