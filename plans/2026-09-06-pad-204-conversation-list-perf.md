# PAD-204 — Conversation list: denormalise the last message, index the access paths

Specs: `messaging.conversations` rules 11-13, `messaging.conversation-detail` rule 8.
Branch: `feature/pad-204-conversation-list-perf`, based on `feature/pad-203-message-read-state`
(PR #62), targeting `staging`.

## Exploration summary

**Relevant existing code**

| File | Role |
|---|---|
| `backend/padel_app/serializers/conversation.py` | Sorts `conversation.messages` in Python for the last message and the unread count. The whole defect. PAD-203 made it tolerant of a missing counterpart — that must survive. |
| `backend/padel_app/services/messaging_service.py` | `get_user_conversations` (correlated `MAX(sent_at)` subquery), `get_unread_count` (the badge's grouped query — the predicate to reuse), `create_message_service`. |
| `backend/padel_app/models/conversations.py` | Gains `last_message_at` / `last_message_id`. |
| `backend/padel_app/models/messages.py` | Gains the indexes and the `after_insert` listener. |
| `backend/padel_app/models/conversation_participants.py` | Gains the unique constraint and the `user_id` index. |
| `backend/padel_app/modules/frontend_api.py` | `get_conversations` (L523) and `conversation_detail` (L539) — thin handlers. |
| `backend/padel_app/services/notification_service.py` L1501, L1602 | Engine message writers (`Message(...)` + `.create()`). |
| `backend/padel_app/services/replacement_approval_service.py` L244 | Third writer (`Message(...)` + `add` + `flush`, no `.create()`). |

**Established patterns**

- Services in `services/`, thin handlers in `modules/` (R-005).
- Models use the `model.Model` mixin: `create()` is add-then-**commit**; `save()` commits.
- Tests: SQLite via `create_all`, so model definitions — not migrations — are what the suite exercises.
- Alembic head off staging: `f1a2b3c4d5e6` (confirmed by `flask db heads` and by the file graph).

**Gap analysis**

- **Reuse:** `get_unread_count`'s predicate (`sender_id != caller`, `is_deleted == False`,
  `sent_at > coalesce(last_read_at, epoch)`).
- **Create:** the `after_insert` listener, `unread_counts_for_conversations`,
  `last_messages_by_id`, `serialize_conversations`, `get_conversation_for_detail`, the migration.
- **Modify:** the three model files, the serializer, `get_user_conversations`, two route handlers.
- **Open question, decided:** three message-insert paths exist and a fourth is one commit away.
  A per-call-site helper is four edits and no guarantee; one `after_insert` listener on `Message`
  is one edit that no future writer can bypass — rule 11 says "no path exempt", so the listener
  it is. It also leaves `create_message_service` byte-identical, which keeps the hunk separable
  from sibling PR #61 (PAD-206), which edits the top of that same function.

## Constraints this plan must satisfy

- **R-005** — query logic in `services/`, not in `modules/frontend_api.py`.
- **R-016** — messages are soft-deleted; a deleted message is not unread.
- **R-023** — every datetime naive UTC.
- **PAD-203 (rule 10)** — a conversation with no counterpart row, and one where the *caller*
  has no row, must still serialize. The grouped unread query therefore **outer**-joins the
  caller's participant row: an inner join would silently return 0 where rule 10 requires
  "as if never read".
- The API payload shape does not change. No frontend work, no iOS work.

## Tasks

### Task 1: Denormalised columns on Conversation

**Criterion:** messaging.conversations — "Ordered by the denormalised last message"
**Files:** `backend/padel_app/models/conversations.py` (modify)
**Change:** add `last_message_at = Column(DateTime, nullable=True)` and
`last_message_id = Column(Integer, ForeignKey("messages.id", ondelete="SET NULL",
use_alter=True, name="fk_conversations_last_message_id"), nullable=True)`. `use_alter` because
`conversations.last_message_id → messages.id` closes a cycle with
`messages.conversation_id → conversations.id`; without it `create_all` cannot order the two
tables. No relationship is declared — a second `Conversation ↔ Message` path would force
`foreign_keys=` on `Conversation.messages` / `Message.conversation` and put a `post_update`
hazard on the existing `delete-orphan` cascade for no gain; the service fetches the pointed-at
rows in one `id IN (...)` query instead.
**Verify:** `./.venv/bin/python -m pytest padel_app/tests/test_pad204_conversation_list_perf.py::test_a_back_dated_insert_does_not_rewind_the_pointer -q`

### Task 2: One writer for the pointer

**Criterion:** messaging.conversations — "A system message moves the thread to the top"
**Files:** `backend/padel_app/models/messages.py` (modify)
**Change:** an `@event.listens_for(Message, "after_insert")` handler that issues a Core UPDATE
on `conversations` through the listener's `connection` (never the ORM session — an `after_insert`
handler must not flush), setting `last_message_at`/`last_message_id` where the row's current
`last_message_at IS NULL OR <= the new sent_at`. Same transaction as the insert by construction,
which is what rule 11 asks for, and it fires for `.create()`, for bare `add` + `flush`, and for
any writer added later.
**Verify:** `./.venv/bin/python -m pytest padel_app/tests/test_pad204_conversation_list_perf.py::test_every_message_insert_path_moves_the_pointer -q`

### Task 3: Indexes and participant uniqueness on the models

**Criterion:** messaging.conversations — "A duplicate participant row is rejected"
**Files:** `backend/padel_app/models/messages.py`, `backend/padel_app/models/conversation_participants.py` (modify)
**Change:** `__table_args__` on `Message` gains `Index("ix_messages_conversation_id_sent_at",
"conversation_id", "sent_at")` and `Index("ix_messages_sender_id", "sender_id")`; on
`ConversationParticipant`, `UniqueConstraint("conversation_id", "user_id",
name="uq_conversation_participant")` and `Index("ix_conversation_participants_user_id",
"user_id")`. Both files currently have a bare `{"extend_existing": True}` dict — it becomes the
last element of a tuple. On the models, not only in the migration, because the test suite builds
its schema with `create_all`.
**Verify:** `./.venv/bin/python -m pytest padel_app/tests/test_pad204_conversation_list_perf.py::test_duplicate_participant_row_is_rejected -q`

### Task 4: Grouped unread + last-message batch in the service

**Criterion:** messaging.conversations — "Per-conversation unread agrees with the badge"
**Files:** `backend/padel_app/services/messaging_service.py` (modify)
**Change:** extract the epoch constant; add `unread_counts_for_conversations(user_id,
conversation_ids)` — one `GROUP BY messages.conversation_id` over the badge's predicate, LEFT
JOINed to the caller's participant row (PAD-203 rule 10); add `last_messages_by_id(ids)` — one
`Message.id IN (...)`; rewrite `get_user_conversations` to order by
`nullslast(Conversation.last_message_at.desc())` with the correlated subquery deleted, and to
`selectinload(Conversation.participants).joinedload(ConversationParticipant.user)`.
**Verify:** `./.venv/bin/python -m pytest padel_app/tests/test_pad204_conversation_list_perf.py::test_listed_unread_counts_sum_to_the_badge -q`

### Task 5: Batched serializer

**Criterion:** messaging.conversations — "The list costs the same at 3 conversations as at 20"
**Files:** `backend/padel_app/serializers/conversation.py`, `backend/padel_app/modules/frontend_api.py` (modify)
**Change:** `serialize_conversation(conversation, user_id, unread_count=_UNSET,
last_message=_UNSET)` — reads the pointer instead of `conversation.messages`, and falls back to
its own single-row lookups when the caller passed nothing (the detail path). Add
`serialize_conversations(conversations, user_id)`, which resolves both batches once and maps
them over the page. `get_conversations` calls it. PAD-203's `next(..., None)` defaults and the
`participantDeleted` flag are untouched.
**Verify:** `./.venv/bin/python -m pytest padel_app/tests/test_pad204_conversation_list_perf.py -k "statement_count_is_constant or never_loads" -q`

### Task 6: Eager reactions on the detail endpoint

**Criterion:** messaging.conversation-detail — "Reactions load in one query, not one per message"
**Files:** `backend/padel_app/services/messaging_service.py`, `backend/padel_app/modules/frontend_api.py` (modify)
**Change:** `get_conversation_for_detail(conversation_id)` in the service — `first_or_404` with
`selectinload(Conversation.messages).selectinload(Message.reactions)` plus the participants and
their users. `conversation_detail` uses it in place of `Conversation.query.get_or_404`.
**Verify:** `./.venv/bin/python -m pytest padel_app/tests/test_pad204_conversation_list_perf.py::test_detail_statement_count_is_constant_in_thread_length -q`

### Task 7: The migration

**Criterion:** messaging.conversations — the Entities block (the two columns, the unique
constraint, the three indexes) reaching a real database
**Files:** `backend/migrations/versions/<uuid4[:12]>_pad204_conversation_last_message.py` (create)
**Change:** `down_revision = "f1a2b3c4d5e6"`, revision id from
`python -c "import uuid;print(uuid.uuid4().hex[:12])"` (audit H13 — never a hand-typed pattern).
Order: add both columns nullable → named FK with `ondelete="SET NULL"` via
`create_foreign_key` (separate from `add_column`, so the cycle never needs resolving inside one
statement) → backfill from the max-`sent_at` message per conversation → delete duplicate
`conversation_participants` keeping `MIN(id)` per pair → unique constraint → the three indexes.
A real `downgrade()` reverses all of it. Not exercised by pytest (SQLite `create_all`), so the
model definitions in Tasks 1 and 3 are what the suite proves; this proves the deployed schema.
**Verify:** `FLASK_APP=padel_app POSTGRES_PORT=5433 ./.venv/bin/python -m flask db heads` shows exactly one head, the new revision.

### Task 8: Regression

**Criterion:** every criterion above, plus everything already green
**Files:** none
**Change:** none.
**Verify:** `./.venv/bin/python -m pytest padel_app/tests/ -q` from `backend/`.

## Size check

One agent. 7 files, ~400 lines of relevant existing code, 3 specs' worth of criteria. No split.

## Out of scope

- Thread pagination (`before=<id>`) — needs both clients, separate backlog ticket.
- Web/iOS work — the payload shape is unchanged, so there is nothing to port (the
  web-and-iOS-ship-together rule is satisfied vacuously: no client surface changed).
- E2E and browser verification — deferred to the orchestrator's integration pass; the E2E
  database is shared with another live session.
