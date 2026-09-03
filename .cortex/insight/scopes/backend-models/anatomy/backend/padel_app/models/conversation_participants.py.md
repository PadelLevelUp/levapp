---
path: backend/padel_app/models/conversation_participants.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 71
size_tokens: 590
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "acea72cb86cbf2cb280b0c05eee7c94d0e992fea0ee5c83ebf04e9031a002064"
---

## Purpose

Join row between Conversation and User tracking `joined_at`/`last_read_at`, which drives the unread-count logic in serializers/conversation.py. PAD-93 (documented in-code): `joined_at`/`last_read_at` were previously declared as "Boolean" fields in the generic-editor form (copy-pasted from Conversation's `is_group`), so every editor save zeroed out the timestamps; now declared as "DateTime".

## Connections

Uses:
- backend/padel_app/model.py: the `Model` mixin -- created_at/updated_at columns, generic CRUD (create/save/delete), and the admin-editor form/display plumbing (get_create_form, display_all_info)
- backend/padel_app/sql_db.py: the shared `db` SQLAlchemy instance this table is declared against

Used by:
- backend/padel_app/models/__init__.py: imports (and re-exports) this class so it is reachable via `padel_app.models`

Semantically related (not imports):
- backend/padel_app/models/conversations.py: Conversation.participants back_populates conversation; last_read_by() and serializers read last_read_at
- backend/padel_app/models/users.py: user relationship (no back_populates declared on User)
