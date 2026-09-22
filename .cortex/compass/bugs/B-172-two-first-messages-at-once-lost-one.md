---
id: B-172
title: "Two first messages to the same person at the same moment: one failed on ix_conversations_participant_key and its message was lost"
type: incomplete-rule
severity: low
status: resolved
affects:
  - messaging.conversations
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/services/replacement_approval_service.py
  - backend/padel_app/services/messaging_service.py
  - backend/padel_app/models/conversations.py
proposed_fix: "Conversation.get_or_insert: insert in a savepoint; on the unique key's IntegrityError, re-read the winner's row. Both system get-or-create paths use it."
opened: 2026-09-22T19:17:00Z
resolved: 2026-09-22T21:00:00Z
---

# B-172 — two first messages at once lost one

**Source:** PAD-411. Found by the PAD-407 race harnesses (Session-A's and Session-C's) on
2026-09-22, when two unlocked reminder passes messaged students with no conversation yet. Kept out
of the PAD-407 hotfix on purpose.

**What happens:** `notification_service._get_or_create_direct_conversation` and
`replacement_approval_service._get_or_create_assistant_conversation` look the conversation up by
`participant_key` and insert it when it is missing. Two callers that both find nothing both
insert; the second fails on `ix_conversations_participant_key`, and its message is lost with an
error.

**Reproduced (2026-09-22, origin/staging 84c125938, Postgres):** `test_pad411_first_message_race.py`
holds two threads at a gate on `INSERT INTO conversations`. Both race cells failed with
`UniqueViolation … duplicate key value violates unique constraint
"ix_conversations_participant_key"`: the system-message path (`_send_system_message`) and the
assistant path. The no-race control passed.

**What should happen:** both callers get the same single conversation, and both messages arrive.

**Which observation selected the type:** `messaging.conversations` rule 2 says a creator "first
checks if one exists". That covers the look-up and says nothing about two creators at once. The
rule exists and is incomplete: incomplete-rule. Prod exposure was latent: the reminder race of
B-161 hit students who already had a conversation, and after PAD-407 those passes are serialised.

**Affected specs:** `messaging.conversations` (rule 2 extended; a new criterion).

### Change Plan (executed)
- `Conversation.get_or_insert(participant_ids)`: look up; else insert the conversation and its
  participants in a SAVEPOINT; on IntegrityError roll back only the savepoint and re-read. It
  flushes and never commits (`lesson_service._get_or_insert`'s shape).
- `_get_or_create_direct_conversation` uses it and then `commit_or_flush()`, the commit its
  `create()` calls made before. `_get_or_create_assistant_conversation` uses it (flush only, as
  before).

### Resolution
- The race cells now pass on Postgres (3/3). The 41 test files that touch conversations, system
  messages or replacement approvals: 403 passed, 3 skipped on SQLite.
- The same check-then-insert sat in `POST /api/app/conversation` (user-driven, rule 6). On the
  coordinator's ruling it is folded into this fix: `create_conversation_service` creates through
  `Conversation.get_or_insert`. A forced double submit on staging's code failed with the same
  `UniqueViolation`; with the fix both POSTs answer 201 with the same conversation and shape.
  The 50 files touching conversations give 465 passed, 4 skipped on SQLite.
