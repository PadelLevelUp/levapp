---
id: B-024
title: "Messaging read state is wrong at second boundaries, and one participant-less conversation 500s the whole list"
type: incomplete-rule
severity: high
status: resolved
affects:
  - messaging.messages
  - messaging.conversations
  - messaging.read-tracking
  - backend/padel_app/services/messaging_service.py
  - backend/padel_app/serializers/conversation.py
  - frontend/packages/types/src/domain.ts
related_specs:
  - .specflow/specs/messaging/messages.spec.md
  - .specflow/specs/messaging/conversations.spec.md
  - .specflow/specs/messaging/read-tracking.spec.md
proposed_fix: "Stamp `sent_at` with `utcnow_naive()` itself (full microsecond precision, same clock as `last_read_at`) instead of a second-truncated strftime string; guard both `next(...)` lookups in `serialize_conversation` with a default and serialize a missing counterpart as `participantId: null` / `participantDeleted: true`; build the conversation and all its participant rows in one transaction (`db.session.add` + `flush`, one commit) so a failure leaves nothing behind."
opened: 2026-09-06T00:00:00Z
resolved: 2026-09-06T00:00:00Z
---

# B-024 — Messaging read state is wrong at second boundaries, and one participant-less conversation 500s the whole list

**Source:** human report (PAD-203), itself derived from the 2026-09-02 data-model audit
(`.cortex/archive/documents/data-model-audit-2026-09-02/extracted/findings.md`, findings H6,
M8b and the `sent_at` note under "smaller duplications").

Three defects, one root cause shape: rules that exist but do not say enough.

## Defect 1 — `sent_at` is truncated to seconds, `last_read_at` is not

**What happens:** `create_message_service` builds its payload with
`utcnow_naive().strftime("%Y-%m-%dT%H:%M:%S")` — a string with the microseconds thrown
away. `mark_conversation_read_service` writes `participation.last_read_at = utcnow_naive()`
with microseconds intact. Unread is `sent_at > last_read_at`
(`messaging.read-tracking` rule 3), so any message sent in the *same wall-clock second*
as a mark-read is stamped at or before the read instant and is born already-read.

**What should happen:** a message sent after a read is unread, however small the interval.

**Evidence (reproduced 2026-09-06, sqlite, `create_message_service` called directly
one statement after `mark_conversation_read_service`):**

```
last_read_at = 2026-09-06T16:27:03.947927
sent_at      = 2026-09-06T16:27:03
sent_at > last_read_at ?  False
get_unread_count(recipient) = 0   (expected 1)
```

The message is invisible to the recipient's badge, permanently. This is the intermittent
residue of the PAD-66 / PAD-125 / PAD-147 / PAD-149 family: those fixed the *clock*
(local vs UTC) and the *row* (participant PK vs user id); nobody fixed the *precision*.
It only bites when a read and a send land in the same second, which is why it survived
four fixes.

**Root cause:** `messaging.messages` rule 9 constrains how `sent_at` is *serialized*
(UTC-aware ISO 8601) and says nothing about how it is *written*. The rule is incomplete,
not wrong.

## Defect 2 — a conversation with no counterpart is a permanent 500 for the list

**What happens:** `serialize_conversation` (`backend/padel_app/serializers/conversation.py:8-16`)
uses `next(...)` with **no default** twice — once for the other participant, once for the
caller's own row. A conversation with a single participant row raises `StopIteration` out
of the serializer, out of the list comprehension in `GET /api/app/conversations`
(`frontend_api.py:534`), and out as a 500. The endpoint returns the caller's *whole* list
or nothing, so one malformed row takes messaging away from that user entirely, on every
request, forever.

**What should happen:** the malformed conversation still serializes (with a null
participant) and the rest of the list is unaffected.

**Evidence (reproduced 2026-09-06):**

```
conversation with only the caller's row      -> StopIteration
conversation with only the counterpart's row -> StopIteration
```

Both directions fail: a hard-deleted counterpart and a lost own-row are equally fatal.

**Root cause:** `messaging.conversations` rule 5 says the endpoint "returns all user's
conversations" and says nothing about what a conversation that cannot be fully described
does to the response. Incomplete rule.

## Defect 3 — conversation creation is not atomic, which is how defect 2's rows are born

**What happens:** `create_conversation_service` calls `conversation.create()` — the base
mixin's `create()` is `db.session.add(self)` **followed by `db.session.commit()`** — and
then loops calling `.create()` on each `ConversationParticipant`, committing again per
row. A failure after the conversation commit (crash, constraint violation, connection
drop) leaves a committed conversation with zero or one participant rows.

**Evidence (reproduced 2026-09-06, second `ConversationParticipant.create()` forced to
raise):**

```
RuntimeError: second participant insert failed
conversations before / after = 3 / 4   (expected 3 / 3)
leftover conversation id 4 has 1 participant row
```

The leftover row is exactly the input defect 2 chokes on. The two defects are one
failure mode with a producer and a consumer.

**What should happen:** the conversation and all its participant rows commit together or
not at all.

**Root cause:** `messaging.conversations` rules 1, 2 and 6 describe *what* creation
produces and never say it is one unit of work. Incomplete rule.

## Affected specs

- Dev: `.specflow/specs/messaging/messages.spec.md` (rule 9),
  `.specflow/specs/messaging/conversations.spec.md` (rules 5, 6),
  `.specflow/specs/messaging/read-tracking.spec.md` (rule 3 — reader, not modified)
- Business: `.specflow/specs-business/messaging/user-and-coach-message-in-real-time.business.md`
  and `.specflow/specs-business/messaging/user-manages-unread-and-notifications.business.md`
  — **no drift.** Both describe the intended outcome correctly ("unread clears when you
  read"; "a conversation between the same two people is found, not recreated"). It is the
  dev layer that under-specified how to deliver it.

### Change Plan

**Type 2 (incomplete rule) ×3.**

**Spec 1 — `.specflow/specs/messaging/messages.spec.md`, extend rule 9:**

> 9. `sent_at` is written with the same clock **and the same precision** as
>    `ConversationParticipant.last_read_at` — `utcnow_naive()` itself, microseconds kept,
>    never a second-truncated string — because unread is decided by
>    `sent_at > last_read_at`. It is serialized as a UTC-aware ISO 8601 string (with an
>    explicit `+00:00`/`Z` offset) in the `timestamp`/`lastMessageAt` fields, so clients
>    parse it correctly and render in the viewer's local timezone.

**Add criterion:**

```
#### A message sent just after a read is unread (B-024)
- **Given** a participant marks a conversation read at instant T
- **When** a message is sent to that conversation 1 ms later
- **Then** the message counts as unread for that participant
```

**Spec 2 — `.specflow/specs/messaging/conversations.spec.md`, add rules 9 and 10** (7-8 are PAD-205's; see the numbering note below)**:**

> 9. A conversation and all of its `ConversationParticipant` rows are written in **one
>    transaction**. A failure part-way leaves no conversation behind — never a
>    participant-less conversation.
> 10. `GET /api/app/conversations` never fails because of one malformed conversation. A
>    conversation whose counterpart is missing serializes with `participantId: null`,
>    `participantName: null`, `participantRole: null` and `participantDeleted: true`, and
>    is still listed; the rest of the list is unaffected. `serialize_conversation_detail`
>    behaves the same way.

**Add criteria** for both (atomic creation; degraded serialization).

**Then:**
1. Coherence check across the messaging leaves (rule 10 must not contradict
   `messaging.conversation-detail`).
2. Write the three pytest cases *first* and watch them fail:
   same-second read/send → unread; single-participant conversation → list 200 with a null
   participant; participant insert raises → no conversation row remains.
3. Fix the code (three sites named in `proposed_fix`).
4. Backend regression across `padel_app/tests/`.

**Not in this bug's plan:** the messaging schema changes (participant uniqueness constraint,
indexes, `last_message_at`) that would make defect 2's row *impossible* rather than merely
*survivable*. Those need an Alembic migration and live in the sibling performance ticket so
the tree keeps one head. Rule 10 is the guard that has to hold until then — and afterwards,
since a hard-deleted user can still orphan a counterpart.

### Numbering note

These rules land as **9** and **10**, not 7 and 8. `messaging.conversations` rules 7-8 are
being added concurrently by PAD-205 (coach messageable set = roster ∪ club; messageable
scope gates only *starting* a conversation), so the two tickets would have collided on the
same two numbers. The spec carries a `<!-- rules 7-8 land in PAD-205 -->` placeholder where
the gap sits, and the criteria headings here are deliberately distinct from PAD-205's.

For the same reason the `sent_at` precision constraint is **rule 9a on
`messaging.messages`**, an amendment to rule 9 rather than a new rule 10 — PAD-206 is
adding rule 10 there (participant check on the message routes).

### Resolution

- Spec changes: `.specflow/specs/messaging/messages.spec.md` (rule 9 + 1 criterion),
  `.specflow/specs/messaging/conversations.spec.md` (rules 9-10 + 3 criteria)
- Tests added: `backend/padel_app/tests/test_pad203_messaging_read_state.py` (6 cases)
- Code changes: `backend/padel_app/services/messaging_service.py`
  (`create_message_service` stamps `utcnow_naive()`; `create_conversation_service` builds
  conversation + participants in one transaction),
  `backend/padel_app/serializers/conversation.py` (both `next(...)` lookups defaulted;
  missing counterpart degrades to a null participant with `participantDeleted: true`)
- Client changes: the null had to reach the shells or the fix would only have MOVED the
  outage. `Conversation.participantName` was typed `string` and both shells called
  `.toLowerCase()` on it while filtering the list
  (`ConversationList.tsx`, mobile `messages.tsx`), so shipping the backend alone would have
  traded a server 500 for a white-screened messages page. `@levelup/types` now mirrors the
  real contract (`participantName`/`participantId`/`participantRole` nullable,
  `participantDeleted?`), a `messages.deletedUser` key was added in pt and en, and both
  shells resolve the label at their render sites. Web and mobile in the same ticket (R-024).
- Resolved: 2026-09-06 (PAD-203)
