---
id: messaging.messages
status: implemented
depends_on: [messaging.conversations]
implements: ../../specs-business/messaging/user-and-coach-message-in-real-time.business.md
governed_by: []
---

# messaging.messages


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
