---
path: backend/padel_app/serializers/conversation.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 56
size_tokens: 427
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "82753cfd97fee65f5970421318c9d0681909ca428fc369194f16a29db6dd3d76"
---

## Purpose

`serialize_conversation(conversation, user_id)` builds the 'other participant' summary by finding the participant whose user_id != user_id -- this assumes exactly two participants (a 1:1 conversation) even though Conversation.is_group exists and is never branched on here; a true group conversation would need different logic. unreadCount compares each message's sent_at against the OWN participant's last_read_at. `serialize_conversation_detail` adds the full ordered message list via serialize_message, using the (PAD-125-fixed) conversation.last_read_by(user_id) model method.

## Connections

Uses:
- backend/padel_app/serializers/message.py: serialize_message builds each message in the detail payload

Used by:
- (none within this scope)

Semantically related (not imports):
- backend/padel_app/models/conversations.py: reads conversation.messages/participants and calls conversation.last_read_by(user_id)
