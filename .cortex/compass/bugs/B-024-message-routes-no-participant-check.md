---
id: B-024
title: "Message send/edit/delete/react never check the caller is a participant"
type: incomplete-rule
severity: high
status: fixed
affects:
  - messaging.messages
  - messaging.reactions
  - backend/padel_app/services/messaging_service.py
proposed_fix: "State the participation requirement as a rule on messaging.messages and enforce it in one guard used by create/edit/delete/react."
opened: 2026-09-06T00:00:00Z
resolved: 2026-09-06T00:00:00Z
---

# B-024 — Message send/edit/delete/react never check the caller is a participant

**Source:** PAD-206, from the 2026-09-02 data-model audit (finding H2). Second half of the
finding; the SSE half is B-004.

**What happens:** `create_message_service` loads the *other* participants of whatever
`conversationId` the request body names and checks blocks against them, but never checks
that the caller is a participant. Any authenticated user could POST
`{"conversationId": <any id>, "text": "..."}` and have the row created, pushed to the real
participants and broadcast over SSE. `toggle_reaction_service` accepted any message id and
republished the full serialized message. `edit_message_service` and
`delete_message_service` checked `sender_id == user_id`, which happens to exclude
non-participants, but nothing said so.

**What should happen:** every message operation is refused with 403 unless the caller is a
participant of that message's conversation — the same check
`report_message_service` already performed, and the same check
`GET /api/app/conversation/<id>` already performed.

**Root cause:** Type 2 — incomplete rule. `messaging.messages` listed the endpoints and a
sender-only rule for edit/delete, but never stated the participation requirement, so the
services were free to omit it and no criterion caught it.

**Evidence:** reproduced on this branch with
`padel_app/tests/test_pad206_sse_scoping_and_participation.py`. Before the fix,
`test_non_participant_cannot_send_message` got **201** with a Message row created and the
push helpers called; `test_non_participant_cannot_react` got **200** with a
MessageReaction row created.

**Affected specs:**
- Dev: `.specflow/specs/messaging/messages.spec.md`, `.specflow/specs/messaging/reactions.spec.md`
- Business: `.specflow/specs-business/messaging/user-and-coach-message-in-real-time.business.md` (unchanged — the outcome always assumed a private conversation)

### Change Plan

**Spec to modify:** `.specflow/specs/messaging/messages.spec.md`
**Change type:** Add rule + acceptance criteria

**Rule added:** rule 10 — send, edit, delete, react, report and read a conversation all
require the caller to be a participant of the message's conversation; otherwise 403, with
no row written, no SSE event and no push. The conversation id comes from the target row,
never from the request body as proof of access.

**Criteria added:** "A non-participant cannot post into a conversation (B-024)" and
"A non-participant cannot react to a message (B-024)".

### Resolution

- Spec changes: `messaging.messages` rule 10 + two criteria; `messaging.reactions` rules 5–6.
- Tests added: `backend/padel_app/tests/test_pad206_sse_scoping_and_participation.py` —
  non-participant send → 403 / no row / `publish` not called, non-participant react → 403 /
  no row, non-participant edit and delete → 403, participant paths still 201/200.
- Code changes: `_require_participant(conversation_id, user_id)` in
  `messaging_service.py`, called first by `create_message_service`,
  `edit_message_service`, `delete_message_service` and `toggle_reaction_service`;
  `report_message_service` reuses it.
- Resolved: 2026-09-06 (PAD-206).
