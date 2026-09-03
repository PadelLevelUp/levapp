---
path: backend/padel_app/serializers/message.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 40
size_tokens: 318
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "124c8ca9f152da3cee83cce4bf1810ec3cd7945b78be79450d7139e725be856a"
---

## Purpose

`serialize_message(message, last_read_at)`: returns a blanked stub (content null, isRead true, reactions []) for a soft-deleted message; otherwise the full payload with a computed `isRead` (sent_at <= last_read_at) and `status` derived from it, the reactions list, and messageType/metadata passthrough for non-text/system messages.

## Connections

Uses:
- (none within this scope)

Used by:
- backend/padel_app/serializers/conversation.py: serialize_conversation_detail calls this per message

Semantically related (not imports):
- backend/padel_app/models/messages.py: reads is_deleted/sender_id/text/sent_at/reply_to_id/edited/message_type/msg_metadata directly
- backend/padel_app/models/message_reaction.py: reads message.reactions (emoji/user_id) into the reactions list
