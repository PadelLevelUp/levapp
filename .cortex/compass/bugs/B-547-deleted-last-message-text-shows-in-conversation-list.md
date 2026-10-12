---
id: B-547
title: "A deleted message kept its text: the conversation list previewed it, the row still held it, and the web reply quote and both shells' caches kept it after the delete"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-12T14:30:00Z
affects:
  - .specflow/specs/messaging/messages.spec.md
  - .specflow/specs/messaging/conversations.spec.md
  - .specflow/specs/messaging/block-and-report.spec.md
  - backend/padel_app/services/messaging_service.py
  - backend/padel_app/serializers/conversation.py
  - frontend/apps/web/src/pages/MessagesPage.tsx
  - frontend/apps/mobile/app/conversation/[id].tsx
proposed_fix: "Deleting erases the message's text, metadata, attachment and reactions (one erase_message, the row kept per R-016); a report keeps its own copy of the text; the list serializes a deleted last message as \"\" + lastMessageDeleted and both shells show \"Message deleted\"; the clients drop the content from their caches."
opened: 2026-10-12T13:45:00Z
---

# B-547: a deleted message kept its text

**Source:** PAD-639 (from the PAD-602 privacy review, D6).

**What happens:** `delete_message_service` only set `is_deleted`. The text, metadata and
reactions stayed in the row. The thread hid them (the serializer withholds a deleted message's
content), but:

- the conversation list serialized `last_message.text` with no deleted check, so a deleted last
  message kept showing its text in the list on web and iOS;
- the web reply quote printed the quoted message's `content` even when it was deleted (iOS
  already showed "deleted");
- both shells kept the content in their local caches after a delete.

**What should happen:** a deleted message keeps nothing it said, anywhere a user can read, and
nothing on the server beyond the row's placeholder; a report keeps a copy for moderation.

**Evidence (Phase 1):** red-first on staging ba17a578b,
`test_pad639_message_erase.py::test_a_deleted_last_message_shows_no_text_in_the_list` failed
with `assert 'call me on 912 345 678' == ''` on the list row after a DELETE that answered 200,
and `test_deleting_erases_text_metadata_attachment_and_reactions` failed with the same text
still in `messages.text`. The web quote read was observed in `MessageBubble.tsx`
(`replyToMessage.content` with no `isDeleted` branch).

**Root cause:** `messaging.messages` rule 3 said "soft delete, sets `is_deleted`" and nothing
about content; `messaging.conversations` rule 12 had no case for a deleted last message.
Incomplete rules: each reader had to remember to hide it, and the list did not.

### Resolution

- Spec changes: messages rule 3 (+3 criteria), block-and-report rule 4a (+1), conversations
  rule 12a (+1); the business rule in user-and-coach-message-in-real-time.
- Tests: `backend/padel_app/tests/test_pad639_message_erase.py`; web and iOS cache and preview
  tests (see PAD-639).
- Code: `erase_message` (shared with PAD-631's moderation delete), `image_cleanup` (the
  in-use check shared with account deletion), the report snapshot, the list flag, migration
  `4d61e34b9a19` (backfills reports, then erases the messages deleted before PAD-639).
- Resolved: 2026-10-12, PAD-639.
