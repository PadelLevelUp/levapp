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
2. Creating a conversation first checks if one exists with the same participant_key. **Two
   creators at the same moment get the same conversation (PAD-411, B-172):** the system paths —
   `notification_service._get_or_create_direct_conversation` (reminders, invitations, waiting-list
   offers) and `replacement_approval_service._get_or_create_assistant_conversation` — go through
   `Conversation.get_or_insert`, which inserts in a savepoint and, when the unique
   `participant_key` refuses it because another caller got there first, re-reads that caller's
   row. Neither caller fails and no message is lost. The user-facing `POST /api/app/conversation`
   (rule 6) creates through the same helper, so a double submit answers `201` with the existing
   conversation in the same shape as a fresh create, on every client including the App Store
   builds, never a 500.
3. `is_group=True` allows group_name display
4. `last_read_at` per participant tracks read status
5. `GET /api/app/conversations` returns all user's conversations
6. `POST /api/app/conversation` finds or creates by participant list, and answers with **the
   same paged shape as `GET /api/app/conversation/{id}`** (PAD-237): `messages` is the newest
   `30` (the clients' first-page size, `CONVERSATION_FIRST_PAGE_SIZE`) in ascending order,
   plus `hasMore` and `oldestMessageId` for walking back. A found conversation with a long
   history is therefore never returned whole; a freshly created one has `messages: []`,
   `hasMore: false`, `oldestMessageId: null`
7. A coach may start a conversation with a player who is **linked** to them, and a student (everyone
   else) with an active coach they are **linked** to. A link is one of two things, read the same way
   from both sides: the coach has the player on their **roster** (`coach_in_player`), or the coach
   teaches a class the player is in that is **not yet over** — an occurrence (`coach_in_lesson_instance` × `presences`) that has not ended
   and is not cancelled, or a series (`coach_in_lesson` × `player_in_lesson`) with an occurrence
   still ahead (one-off: its end is in the future; recurring: no `recurrence_end`, or one not yet
   passed). A past class is not a link, so removing a student from the roster drops the coach
   once their shared classes are over. A declined ("not coming") enrolment on a future class
   still counts: the student is still enrolled. — B-267, PAD-483. **A shared club is not a link**
   (PAD-568, B-461): a coach's join link puts every joiner in the club (`players.join-token` rule 5),
   and the club's other coaches never chose those students, so the `coach_in_club` × `player_in_club`
   arm that PAD-205/B-025 kept on the coach side and B-267 mirrored on the student side is gone
   from both. The two directions are **symmetric** by construction: a student can start a
   conversation with coach C exactly when C can start one with them, so neither side can open a
   thread the other could not have. (The "live class" arm is kept even where every such student
   is already on the roster; it is the one non-roster link the product means to keep.) Club
   membership still feeds `messaging.block-and-report` rule 7 (`isKnownContact`, the "you don't
   share a club" banner): that is a different question from who may start a conversation, and it
   is untouched. The same set backs both `GET /api/app/messageable-users` (the picker) and the 403
   guard on `POST /api/app/conversation` with `otherParticipants`. Blocks, either way, remove a
   user from it. What stays reachable outside the set, on purpose: any active, activated user by exact
   username — placeholder accounts and users without a password never match
   (`messaging.direct-by-username` rules 2–3, decision 2026-09-06 item 5) — and any automatic
   message, which never consults the set (system sends create their own direct conversation).
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
14. Students are never listed: `GET /api/app/messageable-users` for a student returns coaches
    only; there is no endpoint that lists or searches students by name or username. The
    student-to-student path by exact username is `messaging.direct-by-username`, and blocks are
    specified in `messaging.block-and-report`.
15. **Public user shape (PAD-227, B-031).** `GET /api/app/messageable-users` and
    `GET /api/app/users` return the *public* user shape only: `id`, `name`, `username`, `role`
    (`coach`|`player`), `avatarUrl`, `abbreviation`, `isActive`. Never `email`, `phone` or
    `language`: contact details reach a caller only through their own `/api/auth/me` and
    `/api/app/coach`, or through a coach's roster payloads (`players.*`), which are scoped to
    that coach's own players. Any other user-bearing list payload added later uses the same
    public shape unless its spec says why not.

16. **An unread row is unmistakable (PAD-414).** A listed conversation with `unreadCount > 0` shows the
    other participant's name and the last-message preview in **bold**, plus the count pill; the pill
    reads the number up to 9 and **"9+"** above it (`unreadBadgeLabel` in `@levelup/config`, shared).
    A read row is regular weight with no pill. Web and iOS alike; each row exposes its state for tests
    (web `data-unread` on `conversation-row-<id>`, iOS `conversation-unread-<id>`).

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

#### A player who is only in the coach's club is not messageable (PAD-568, B-461)
- **Given** player Q is in a club C belongs to but has no `coach_in_player` row for C and is in no
  class of C's that is not yet over
- **When** C requests `GET /api/app/messageable-users`, or POSTs a conversation with Q
- **Then** Q is absent from the list and the POST answers 403
- **And** the same Q reached by `otherUsername` still opens the conversation

#### Coach messages a student in a class they teach that is not yet over (PAD-568)
- **Given** student T is on no roster of C's and in no club with C, but is enrolled in an occurrence
  C teaches that ends tomorrow
- **When** C requests `GET /api/app/messageable-users`, or POSTs a conversation with T
- **Then** T appears in the list and the conversation is created
- **And** once that occurrence is over (or cancelled), T is absent and the POST answers 403

#### Coach cannot message an unrelated player
- **Given** player R is neither on C's roster nor in a class C teaches that is not yet over
- **When** C POSTs a conversation with R
- **Then** the request is rejected with 403, and R never appeared in C's messageable list

#### The two directions agree (PAD-568)
- **Given** coach C and players linked to C each a different way — roster, live occurrence, live
  series, shared club only, a class that is over, and no link at all
- **When** each player GETs `/api/app/messageable-users` and C GETs it too
- **Then** C is in a player's list exactly when that player is in C's list

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

#### The picker never carries contact details (PAD-227)
- **Given** student S connected to coach C, and coach C with a roster
- **When** S GETs `/api/app/messageable-users` and `/api/app/users`
- **Then** every entry has `id`, `name`, `username`, `role`, `avatarUrl`, `abbreviation` and no `email`, `phone` or `language` key
- **When** C GETs the same two routes
- **Then** the entries have the same public shape, while `GET /api/app/players` still carries the roster's `email` and `phone` for C

#### Students are not discoverable
- **Given** an authenticated student
- **When** they GET `/api/app/messageable-users`
- **Then** every entry has role `coach`; no student appears

#### A student's picker lists only linked coaches (B-267, narrowed by PAD-568)
- **Given** student S on coach A's roster, sharing a club (and nothing else) with coach B, enrolled
  in a series coach C teaches and in an occurrence coach D teaches, and active coach E with none
  of these links
- **When** S GETs `/api/app/messageable-users`
- **Then** the response holds A, C and D, and neither B nor E

#### A shared club is not a link (PAD-568, B-461)
- **Given** student S who accepted coach A's join link, so S is on A's roster and in A's club, and
  coach B who is in that club and has S on no roster and in no class that is not yet over
- **When** S GETs `/api/app/messageable-users` and POSTs `/api/app/conversation` with
  `otherParticipants: [B]`
- **Then** B is absent and the POST answers 403, while A is present
- **And** POSTing `otherUsername: "<B's username>"` still opens the conversation

#### A student with no coach sees the connect shortcut (PAD-568)
- **Given** a student with no roster row and no class that is not yet over, so
  `GET /api/app/messageable-users` answers `[]`
- **When** they open the new-conversation picker on web or on iOS
- **Then** instead of a list they see "Ainda não estás ligado a ninguém" and a
  "Ligar-me a um treinador" action that opens the connect-with-a-coach screen
  (`players.join-token` rule 8), and the "Message by username" field stays available below
- **And** a student whose every linked coach already has a thread sees the "already have
  conversations" line, not the shortcut

#### A student cannot start a conversation with an unlinked coach (B-267)
- **Given** the same S and E
- **When** S POSTs `/api/app/conversation` with `otherParticipants: [E]`
- **Then** the response is 403
- **And** POSTing `otherUsername: "<E's username>"` instead still opens the conversation

#### Removing a link does not cut an existing thread (B-267, rule 8)
- **Given** S and A have a conversation, A then removes S from the roster, and they share no class that
  is not yet over
- **When** S sends a message in that conversation
- **Then** it is delivered, and A no longer appears in S's picker

#### A class that is over is not a link (B-267, #514 review)
- **Given** coach F taught S once, 90 days ago, and S is on no roster, club or current class of F's
- **When** S GETs `/api/app/messageable-users` and POSTs `otherParticipants: [F]`
- **Then** F is absent and the POST answers 403
- **And** the same holds for a series whose `recurrence_end` has passed, a one-off class that has ended,
  and a future occurrence that was cancelled; a future occurrence S declined still links

#### The clients say why a picked person cannot be messaged (B-267)
- **Given** a picker row that the server refuses with 403 (a stale list)
- **When** the user taps it on web or on iOS
- **Then** the screen shows "You can't message this user" and stays on the picker

#### Two first messages at once make one conversation (PAD-411)
- **Given** a coach and a student with no conversation between them
- **When** two system messages to that student are sent at the same moment (Postgres)
- **Then** exactly one conversation exists, with both of them as participants
- **And** both messages are in it

#### Unread rows are bold and the count caps at 9+ (PAD-414)
- **Given** Maria's list holds a conversation with 3 unread, one with 12 unread and one read
- **When** she opens Messages on web and on iOS
- **Then** the first two rows show a bold name and preview with pills "3" and "9+", and the read row is regular weight with no pill

