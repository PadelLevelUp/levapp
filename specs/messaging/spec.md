# messaging — Real-Time Messaging

## messaging.conversations

---
id: messaging.conversations
status: implemented
depends_on: [auth.login]
---

### Intent
Manage conversations between users (1:1 or group chats).

### Entities
- **Conversation** (`conversations`): group_name, is_group (bool), participant_key (unique, indexed)
- **ConversationParticipant** (`conversation_participants`): conversation_id, user_id, joined_at, last_read_at

### Rules
1. `participant_key` = comma-separated sorted user IDs (e.g., "1,5,12") — ensures idempotent lookup
2. Creating a conversation first checks if one exists with the same participant_key
3. `is_group=True` allows group_name display
4. `last_read_at` per participant tracks read status
5. `GET /api/app/conversations` returns all user's conversations
6. `POST /api/app/conversation` finds or creates by participant list

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

---

## messaging.messages

---
id: messaging.messages
status: implemented
depends_on: [messaging.conversations]
---

### Intent
Send, edit, and delete messages within conversations, with support for replies and attachments.

### Entities
- **Message** (`messages`): text, sent_at, sender_id, conversation_id, attachment_id (FK → images), reply_to_id (self-referential), edited (bool), is_deleted (bool), message_type (text|notification|system), msg_metadata (JSON)

### Rules
1. `POST /api/app/message` — create message, sends push notifications to other participants
2. `PATCH /api/app/message/{id}` — edit (sender only), sets `edited=True`
3. `DELETE /api/app/message/{id}` — soft delete (sender only), sets `is_deleted=True`
4. Messages can reply to another message (`reply_to_id`)
5. Messages can have image attachments (`attachment_id`)
6. System messages have `message_type="notification"` or `"system"` with `msg_metadata`
7. On send: push notification sent to all other conversation participants
8. On send: SSE event published to real-time stream
9. `sent_at` is stored as naive UTC in the DB and serialized as a **UTC-aware ISO 8601 string** (with an explicit `+00:00`/`Z` offset) in the `timestamp`/`lastMessageAt` fields, so clients parse it correctly and render in the viewer's local timezone

### Acceptance Criteria

#### Timestamp reflects viewer's local timezone
- **Given** a message whose `sent_at` is `2026-07-01T17:00:00` UTC
- **When** the message payload is serialized
- **Then** `timestamp` carries an explicit UTC offset (e.g. `2026-07-01T17:00:00+00:00`)
- **And** a client in Lisbon (UTC+1 in summer) renders it as 18:00 local, not 17:00

#### Send message
- **Given** a conversation between users 1 and 5
- **When** user 1 POSTs to `/api/app/message` with `{"conversationId": 10, "text": "Hello!"}`
- **Then** a Message record is created with sender_id=1
- **And** a push notification is sent to user 5
- **And** an SSE event `message_created` is published

#### Edit message
- **Given** message id 50 sent by user 1
- **When** user 1 PATCHes with `{"text": "Hello there!"}`
- **Then** the message text is updated and `edited=True`
- **And** an SSE event `message_edited` is published

#### Delete message
- **Given** message id 50 sent by user 1
- **When** user 1 DELETEs the message
- **Then** `is_deleted=True` (soft delete)
- **And** an SSE event `message_deleted` is published

#### Only sender can edit/delete
- **Given** message id 50 sent by user 1
- **When** user 5 tries to PATCH or DELETE
- **Then** the request is rejected (403)

---

## messaging.reactions

---
id: messaging.reactions
status: implemented
depends_on: [messaging.messages]
---

### Intent
Users can add emoji reactions to messages, with toggle behavior.

### Entities
- **MessageReaction** (`message_reactions`): message_id, user_id, emoji (String 8)
- Unique constraint: (message_id, user_id, emoji)

### Rules
1. `POST /api/app/message/{id}/reaction` with `{"emoji": "👍"}` toggles the reaction
2. If reaction exists: remove it. If not: add it.
3. Multiple users can react with the same emoji
4. Same user can have multiple different emoji reactions on one message
5. SSE event published on reaction change

### Acceptance Criteria

#### Toggle reaction on
- **Given** message 50 with no reactions from user 1
- **When** user 1 POSTs reaction `{"emoji": "👍"}`
- **Then** a MessageReaction is created

#### Toggle reaction off
- **Given** message 50 with a "👍" reaction from user 1
- **When** user 1 POSTs reaction `{"emoji": "👍"}` again
- **Then** the MessageReaction is deleted

---

## messaging.read-tracking

---
id: messaging.read-tracking
status: implemented
depends_on: [messaging.conversations]
---

### Intent
Track which messages each participant has read, providing unread counts.

### Rules
1. `POST /api/app/conversation/{id}/read` updates `last_read_at` to now
2. `GET /api/app/messages/unread_count` returns total unread count across all conversations
3. Unread = messages where `sent_at > participant.last_read_at`
4. Frontend `LayoutContext` refreshes unread count periodically
5. Unread badge shown on Messages nav item

### Acceptance Criteria

#### Mark conversation read
- **Given** user 1 has 5 unread messages in conversation 10
- **When** they POST to `/api/app/conversation/10/read`
- **Then** `last_read_at` is updated to now
- **And** the unread count for conversation 10 becomes 0

---

## messaging.sse-realtime

---
id: messaging.sse-realtime
status: implemented
depends_on: [messaging.messages]
---

### Intent
Deliver real-time message updates to connected clients via Server-Sent Events.

### Rules
1. `GET /api/app/events` (JWT via query string) opens an SSE stream
2. In-memory pub/sub: `subscribe()`, `unsubscribe()`, `publish()`
3. Events published: `message_created`, `message_edited`, `message_deleted`, `reaction_toggled`
4. Each event is JSON with `{type, payload}`
5. Frontend `EventSource` consumes the stream and updates UI optimistically
6. On disconnect, client queue is cleaned up

### Notes
- In-memory only — does not persist across server restarts
- Single-server architecture (no Redis pub/sub for horizontal scaling)
- OPEN: No user-level event filtering — all events broadcast to all connected clients

---

## messaging.push-notifications

---
id: messaging.push-notifications
status: implemented
depends_on: [messaging.messages, auth.push-subscription]
---

### Intent
Send browser push notifications when a new message arrives and the recipient isn't actively viewing the conversation.

### Rules
1. On message send, `send_push_notification()` called for each recipient
2. Uses VAPID web push (pywebpush library)
3. Notification includes: title (sender name), body (message text), URL (conversation link)
4. Only sent to users with a valid `push_subscriptions` record
5. Native (Expo) message pushes carry `badge` = the recipient's unread message
   total at send time, so the iOS home-screen icon badge matches the in-app
   unread count. The count is the recipient's real total, not an increment, so
   the badge self-corrects after an undelivered push
6. Both clients keep the app-icon badge in sync with the unread count while
   running — iOS via `setBadgeCountAsync`, installed web via the Badging API —
   and clear it on logout. A notification payload is never the only writer of
   the badge: without a client-side writer a stale badge can never be cleared
   (PAD-147)

---

## messaging.conversation-detail

---
id: messaging.conversation-detail
status: implemented
depends_on: [messaging.conversations, messaging.messages]
---

### Intent
View a single conversation with all its messages and participant info.

### Rules
1. `GET /api/app/conversation/{id}` returns conversation + messages + participants
2. Messages ordered by `sent_at` ascending
3. Includes reaction data and reply chains
4. Frontend renders as scrollable message list with chat bubbles
5. Conversation payload includes the other participant's role (`participantRole`: `"coach"` or `"player"`), derived from `User.role`
6. The chat header subtitle displays the participant's actual role (capitalized), not a hardcoded value
7. While the on-screen keyboard is open, the message composer stays docked directly above it with no gap, and the most recent message stays visible. On the native shell the `KeyboardAvoidingView` offset must equal the real distance between that view's bottom edge and the bottom of the screen — 0 for a full-height stack route — never a hardcoded constant, since React Native adds the offset to the avoided height rather than subtracting it

### Acceptance Criteria

#### Coach participant shown with correct role
- **Given** a conversation whose other participant is a coach
- **When** the user opens the conversation
- **Then** the chat header subtitle reads "Coach" (not "Player")

#### Composer stays docked to the keyboard
- **Given** a user viewing a conversation on the native iOS app
- **When** they focus the message input and the keyboard opens
- **Then** the composer is flush against the top of the keyboard with no empty band between them,
  and the latest message remains visible above it
