---
path: backend/padel_app/models/conversations.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 88
size_tokens: 726
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f8e296d5e61399b8e0af0d66fa0403e9027caf43ded1eb0b1b7f3128086b4d3b"
---

## Purpose

Conversation is a 1:1 or group chat container. `participant_key` is a unique deterministic string from `build_participant_key()` (sorted, comma-joined participant user ids), used to look up an existing conversation instead of creating duplicates. `last_read_by(user_id)` (PAD-125, documented in-code) matches on `ConversationParticipant.user_id` -- NOT `.id`, the join row's own primary key from a different sequence -- a wrong match there either found no row (every message read as unread) or, worse, leaked another participant's read state. `get_create_form` (PAD-93) removed a phantom `validated` field that had no backing column and crashed `get_edit_form()`'s `getattr` call.

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/messages.py: messages back_populates conversation, cascade delete-orphan
- backend/padel_app/models/conversation_participants.py: participants back_populates conversation, cascade delete-orphan
- backend/padel_app/serializers/conversation.py: serialize_conversation/serialize_conversation_detail call last_read_by() and read participant_key/is_group indirectly
