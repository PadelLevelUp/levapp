---
id: messaging.conversations
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/messaging/user-and-coach-message-in-real-time.business.md
governed_by: []
---

# messaging.conversations


### Intent
Manage conversations between users (1:1 or group chats).

### Entities
- **Conversation** (`conversations`): group_name, is_group (bool), participant_key (unique,
  indexed), last_message_at (nullable datetime), last_message_id (nullable FK → `messages.id`,
  `ON DELETE SET NULL`)
- **ConversationParticipant** (`conversation_participants`): conversation_id, user_id, joined_at,
  last_read_at — unique on (conversation_id, user_id), indexed on user_id
- **Message** (`messages`): indexed on (conversation_id, sent_at) and on sender_id — the access
  paths the conversation list and the unread query take

### Rules
1. `participant_key` = comma-separated sorted user IDs (e.g., "1,5,12") — ensures idempotent lookup
2. Creating a conversation first checks if one exists with the same participant_key
3. `is_group=True` allows group_name display
4. `last_read_at` per participant tracks read status
5. `GET /api/app/conversations` returns all user's conversations
6. `POST /api/app/conversation` finds or creates by participant list
7. A coach may start a conversation with any player on their **roster** (`coach_in_player`) or in
   any **club** they belong to (`player_in_club`) — the union of the two is the coach's
   messageable set. Everyone else is a student and may start a conversation with any active coach.
   The same set backs both `GET /api/app/messageable-users` (the picker) and the 403 guard on
   `POST /api/app/conversation`. Blocks, either way, remove a user from it.
8. The scope in rule 7 governs **starting** a conversation only. It never restricts sending inside
   a conversation that already exists.
9. A conversation and **all** of its `ConversationParticipant` rows are written in one
   transaction. A failure part-way through creation leaves nothing behind — never a
   committed conversation with a missing participant row (B-024)
10. `GET /api/app/conversations` never fails because of one malformed conversation. A
   conversation whose counterpart is missing (hard-deleted user, empty participant list, a
   row lost before rule 9 existed) serializes with `participantId: null`,
   `participantName: null`, `participantRole: null` and `participantDeleted: true`, and is
   still listed; every other conversation in the list is unaffected. Clients render their own
   localized "Deleted user" label from the flag — the server sends no display string, because
   there is no server-side i18n for serializer output. `serialize_conversation_detail`
   degrades identically (B-024)
11. `conversations.last_message_at` and `conversations.last_message_id` are the denormalised
    pointer to the most recent message in the thread. They are written **in the same
    transaction as the message insert itself** — every path that creates a `messages` row
    (a user sending one, and every system/notification message the engine writes) maintains
    them, with no path exempt. A message whose `sent_at` is not newer than the stored
    `last_message_at` does not move the pointer, so a back-dated or replayed insert cannot
    rewind the thread. `GET /api/app/conversations` is ordered by `last_message_at`
    descending, nulls last; a conversation with no messages sorts to the end
12. The conversation list is computed **without loading message bodies**. The last-message
    text and timestamp come from the denormalised columns of rule 11, never from hydrating
    `conversation.messages`; the unread count for every listed conversation comes from a
    **single grouped query** over `messages.sent_at > coalesce(last_read_at, epoch)` for the
    caller, not one query (or one Python scan) per conversation. Consequently the number of
    SQL statements the endpoint issues is a constant — it does not grow with the number of
    messages in the listed conversations, nor with the page size. A message the sender has
    soft-deleted (R-016) is not unread: the per-conversation counts use the same predicate as
    the app-wide badge (`get_unread_count`), so the badge total and the sum of the listed
    counts agree
13. A user appears **at most once** in a conversation. `(conversation_id, user_id)` is unique
    on `conversation_participants` and enforced by the database, not only by the code that
    builds the participant list — a second insert for the same pair is rejected

### Acceptance Criteria

#### Create or find conversation
- **Given** users 1 and 5 have no existing conversation
- **When** user 1 POSTs to create a conversation with participant 5
- **Then** a Conversation is created with participant_key "1,5"
- **And** two ConversationParticipant records are created

#### Idempotent creation
- **Given** a conversation already exists between users 1 and 5
- **When** user 5 tries to create a conversation with user 1
- **Then** the existing conversation is returned (no duplicate)

#### Coach messages a player they added in the app
- **Given** coach C added player P through the app, so P has a `coach_in_player` row for C and no
  `player_in_club` row for any of C's clubs
- **When** C requests `GET /api/app/messageable-users`, or POSTs a conversation with P
- **Then** P appears in the list, and the conversation is created

#### Coach messages a player who is only in their club
- **Given** player Q is in a club C belongs to but has no `coach_in_player` row for C
- **When** C requests `GET /api/app/messageable-users`
- **Then** Q still appears in the list

#### Coach cannot message an unrelated player
- **Given** player R is neither on C's roster nor in any club C belongs to
- **When** C POSTs a conversation with R
- **Then** the request is rejected with 403, and R never appeared in C's messageable list

#### Creation is all-or-nothing (B-024)
- **Given** user 1 creates a conversation with user 5
- **When** the second `ConversationParticipant` insert fails
- **Then** no `Conversation` row remains
- **And** no orphaned `ConversationParticipant` row remains

#### One malformed conversation does not break the list (B-024)
- **Given** user 1 has three conversations, one of which has no participant row for anyone
  but user 1
- **When** user 1 GETs `/api/app/conversations`
- **Then** the response is 200 and lists all three
- **And** the malformed one carries `participantId: null`, `participantName: null`,
  `participantRole: null` and `participantDeleted: true`
- **And** the other two are serialized normally

#### A conversation the caller has no row in still serializes (B-024)
- **Given** a conversation whose only participant row belongs to someone else
- **When** it is serialized for user 1
- **Then** serialization succeeds and `unreadCount` is computed as if user 1 had never read
  it, rather than raising

#### Ordered by the denormalised last message (PAD-204)
- **Given** user 1 is in conversations A, B and C, whose newest messages were sent at 10:00,
  12:00 and 09:00 respectively, and in conversation D which has no messages at all
- **When** user 1 GETs `/api/app/conversations`
- **Then** the order is B, A, C, D — `last_message_at` descending with the empty conversation last
- **And** each entry's `lastMessage` and `lastMessageAt` come from `last_message_id` /
  `last_message_at`, matching the newest message of that thread

#### A system message moves the thread to the top (PAD-204)
- **Given** conversation A's newest message is from 10:00 and conversation B's is from 12:00
- **When** the notification engine writes a system message into conversation A at 13:00
- **Then** conversation A's `last_message_at` is 13:00 and it now sorts above B
- **And** a message inserted with an older `sent_at` than the stored `last_message_at` leaves
  both denormalised columns untouched

#### The list costs the same at 3 conversations as at 20 (PAD-204)
- **Given** user 1 has 3 conversations of one message each
- **And** the same user after 17 more conversations exist, and again after 300 messages have
  been added behind the original 3
- **When** user 1 GETs `/api/app/conversations` in each case
- **Then** the endpoint issues the same number of SQL statements in all three cases — the
  count grows with neither the page size nor the length of the threads on it
- **And** serializing the page leaves `Conversation.messages` unloaded on every row: at most
  one `messages` row per conversation is fetched, the one `last_message_id` points at

#### Per-conversation unread agrees with the badge (PAD-204)
- **Given** user 1 has conversation A with 2 unread messages from the other party, and
  conversation B with 3, one of which the sender has since soft-deleted
- **When** user 1 GETs `/api/app/conversations`
- **Then** the `unreadCount` values are 2 for A and 2 for B
- **And** their sum equals `get_unread_count(1)`, the number the app badge shows

#### A duplicate participant row is rejected (PAD-204)
- **Given** a conversation that already has a `ConversationParticipant` row for user 5
- **When** a second row for conversation and user 5 is inserted
- **Then** the database rejects it with an integrity error
- **And** the conversation still has exactly one participant row for user 5
