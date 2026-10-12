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
3. `DELETE /api/app/message/{id}` — soft delete (sender only), sets `is_deleted=True`. **Deleting
   erases the content (PAD-639).** In the same transaction the row's `text` becomes `""`,
   `msg_metadata` and `attachment_id` become null, `edited` is reset and its reactions are
   removed; the attachment's image row and storage object go too unless something else still
   points at that image (the same in-use check as `auth.account-deletion` rule 2a). The row itself
   stays (R-016) with `sender_id`, `conversation_id`, `sent_at`, `message_type` and `reply_to_id`,
   so the placeholder, the thread order and the reply chain survive. There is no grace period —
   no client offers undo. One function, `erase_message`, does this; every delete path (the
   sender's, and the staff console's moderation delete of PAD-631) calls it. A report keeps its
   own copy of the reported text (`messaging.block-and-report` rule 4a), so erasing never
   destroys moderation evidence. A message deleted before PAD-639 is erased by its migration
   the same way. The clients drop the content from their caches on delete as well: on web and
   iOS, a message the user deleted or a `message_deleted` event names keeps no text, metadata,
   attachment or reactions in memory, and a reply quoting it shows "Message deleted"
4. Messages can reply to another message (`reply_to_id`)
5. Messages can have image attachments (`attachment_id`)
5a. An attachment is **private**. It is stored in a bucket with no public ACL and
    served as a short-lived signed URL, never as a durable public link. A signed URL
    lives `SIGNED_URL_MINUTES` (60) and is **reused per object key for
    `SIGNED_URL_REUSE_MINUTES` (50) within a process** (PAD-593): an image costs one signing
    (on the VM, one IAM `signBlob` round trip) per window instead of one per response, keeps the
    same URL within the window so browsers and the iOS image cache hit, and a reused URL always
    has at least 10 minutes left; its storage key carries a random segment so it cannot be guessed
    from the sender, the send time or the original filename (B-047)
5b. **A signer that is missing or failing degrades to "no image", never to an error** (B-018).
    When no uploads bucket is configured, or the runtime cannot mint a signed URL (no
    `iam.serviceAccountTokenCreator` on the service account, storage unreachable), the
    attachment URL — and every other image URL built the same way: avatars, club logos —
    serializes as `null` and the failure is logged. A payload that carries an image must never
    fail because the image cannot be signed. The storage client is created once per process,
    not once per image, and a failed signing is not retried for the same image for
    `SIGNING_FAILURE_RETRY_SECONDS` (60) (PAD-593).
6. **Automatic messages are told apart from typed ones (PAD-492).** A message the app generated
   (reminder, vacancy invitation — a waiting-list one included —, waiting-list offer, class added/cancelled notice,
   join- and class-request notices and replies, spot-filled/confirm/decline replies, replacement
   approval, shared evaluation) is written with a `message_type` other than `"text"` or with a
   non-null `msg_metadata` — `_send_system_message` always writes `msg_metadata or {}`, and every
   other automatic writer names its own key. The human path (`POST /api/app/message`) writes
   neither: `message_type` stays `"text"` and `msg_metadata` stays null, whatever the body sends.
   `serialize_message` derives `isAutomatic` from exactly that, so every automatic message is
   marked, the historic ones included (all automatic writers have stamped one or the other since
   notifications began, 2026-03-11). A deleted message serializes `isAutomatic: false` with the
   rest of its content withheld.
7. On send: push notification sent to all other conversation participants. **One exception
   (PAD-402, owner's Q3):** the evaluation-share system message (`evaluations.sharing` rule 8)
   is written and published over SSE like any other but is **never pushed** — the sender is
   called with its push step off. No other message is exempt.
8. On send: SSE event published to real-time stream
9. `sent_at` is stored as naive UTC in the DB and serialized as a **UTC-aware ISO 8601 string** (with an explicit `+00:00`/`Z` offset) in the `timestamp`/`lastMessageAt` fields, so clients parse it correctly and render in the viewer's local timezone
9a. `sent_at` is written with the same clock **and the same precision** as
    `ConversationParticipant.last_read_at` — the value `utcnow_naive()` returns, microseconds
    kept — never a second-truncated string (B-024). Unread is decided by
    `sent_at > last_read_at` (`messaging.read-tracking` rule 3), so truncating one side of
    that comparison and not the other makes any message sent in the same wall-clock second
    as a mark-read born already-read
10. **Every message operation requires the caller to be a participant of the message's
    conversation** — sending (`POST /api/app/message`), editing, deleting, reacting
    (`POST /api/app/message/{id}/reaction`), reporting and reading the conversation
    (`GET /api/app/conversation/{id}`). A non-participant gets **403**; nothing is
    written, no SSE event is published and no push is sent. Being the sender is an
    additional requirement for edit and delete (rules 2 and 3), not a substitute for
    this one, and the conversation id is taken from the target row — never trusted
    from the request body as proof of access (B-026)

11. **A message has text (PAD-390, B-136).** `POST /api/app/message` and `PUT /api/app/message/{id}`
    refuse a missing, `null`, `""` or whitespace-only `text` with `400 {"error": "invalid_fields",
    "fields": ["text"]}` and write nothing; `""` used to reach the NOT NULL column as an
    IntegrityError and an absent key a KeyError — a 500 either way. What text there is, is stored
    as sent, untrimmed: "0" and " spaced " are messages.

### Acceptance Criteria

#### Timestamp reflects viewer's local timezone
- **Given** a message whose `sent_at` is `2026-07-01T17:00:00` UTC
- **When** the message payload is serialized
- **Then** `timestamp` carries an explicit UTC offset (e.g. `2026-07-01T17:00:00+00:00`)
- **And** a client in Lisbon (UTC+1 in summer) renders it as 18:00 local, not 17:00

#### A message sent just after a read is unread (B-024)
- **Given** a participant marks a conversation read at instant T
- **When** a message is sent to that conversation 1 ms later
- **Then** the message counts as unread for that participant
- **And** the same holds anywhere inside the same wall-clock second

#### Attachment is not publicly readable
- **Given** a message with an image attachment
- **When** the message payload is serialized for a participant
- **Then** the attachment URL is a signed URL that expires
- **And** fetching the underlying object without that signature is refused
- **And** the storage key cannot be derived from the sender, timestamp or filename

#### An attachment that cannot be signed is omitted, not an error (B-018)
- **Given** a message with a private image attachment
- **And** a runtime with no uploads bucket configured, or whose signer raises
- **When** the message payload is serialized
- **Then** the response succeeds with `attachmentUrl` `null`
- **And** the same holds for a user's avatar and a club's logo in any payload
- **And** one storage client serves every image signed in that process
- **And** a second payload within a minute does not ask the signer again for that image

#### An image is signed once per window and keeps its URL (PAD-593)
- **Given** a private image with object key `images/user/a.jpg` and a working signer
- **When** it is serialized twice, by two different row objects, 49 minutes apart
- **Then** the signer is called once and both payloads carry the same URL
- **And** 50 minutes after the first signing the next payload carries a freshly signed URL
- **And** eight participants with photos, serialized twice, cost eight signings in total

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

#### Deleting erases the content (rule 3, PAD-639)
- **Given** message 50 from user 1 with text "call me on 912 345 678", metadata `{"x": 1}`, an
  attachment image used by nothing else, and a 👍 reaction from user 5
- **When** user 1 DELETEs it
- **Then** the row still exists with `is_deleted=True`, `text` `""`, null `msg_metadata` and
  `attachment_id`, `edited` false and no reactions
- **And** the image row is gone and its storage object deletion was requested
- **And** no column of the `messages` table still holds "912 345 678"

#### An attachment something else uses survives the erase (rule 3)
- **Given** message 50's attachment is also a user's profile photo
- **When** user 1 deletes message 50
- **Then** the message's `attachment_id` is null and the image row and object are kept

#### A deleted message leaves nothing in a client's cache (rule 3)
- **Given** a thread open on web and on iOS showing message 50 and a reply quoting it
- **When** user 1 deletes message 50, or the other side receives `message_deleted` for it
- **Then** the cached message has no content, metadata, attachment or reactions
- **And** the reply's quote reads "Message deleted", not the old text

#### Only sender can edit/delete
- **Given** message id 50 sent by user 1
- **When** user 5 tries to PATCH or DELETE
- **Then** the request is rejected (403)

#### A non-participant cannot post into a conversation (B-026)
- **Given** a conversation between users 1 and 5
- **And** user 9 who is not a participant of it
- **When** user 9 POSTs to `/api/app/message` with that `conversationId`
- **Then** the response is 403
- **And** no Message row is created
- **And** no SSE event is published and no push notification is sent

#### A non-participant cannot react to a message (B-026)
- **Given** message id 50 in a conversation between users 1 and 5
- **When** user 9 POSTs `/api/app/message/50/reaction` with `{"emoji": "👍"}`
- **Then** the response is 403 and no MessageReaction row is created

#### An SSE event only reaches the conversation's participants (B-004)
- **Given** a conversation between users 1 and 5, and a connected user 9
- **When** user 1 sends a message in it
- **Then** the `message_created` event is delivered to users 1 and 5 only

#### A typed message is never marked automatic (rule 6, PAD-492)
- **Given** a conversation the sender is in
- **When** they POST `{"conversationId": …, "text": "hi", "messageType": "notification_reminder", "metadata": {"x": 1}}`
- **Then** the stored message has `message_type` `"text"` and null `msg_metadata`, and it serializes `isAutomatic: false`

#### Every automatic writer marks its message (rule 6, PAD-492)
- **Given** the backend source
- **When** every `Message(` construction outside the human send path is listed, along with `_send_system_message`'s own write
- **Then** each passes a non-`"text"` `message_type` or a non-null `msg_metadata`, so a new automatic message added without either fails the guard instead of looking human

#### A template reply with no metadata is still automatic (rule 6, PAD-492)
- **Given** a coach's "spot filled" reply sent through `_send_system_message` with no type and no metadata
- **When** the conversation is fetched
- **Then** that message serializes `isAutomatic: true`

#### A message with no text is refused (rule 11)
- **Given** a conversation the sender is in
- **When** they POST `{"conversationId": …, "text": ""}`, `null`, `"   "`, or no `text` key — or PUT the same to a message of theirs
- **Then** the answer is 400 with `fields` `["text"]` and no message row exists (the edited one is unchanged)
- **When** they POST `"text": "0"`
- **Then** the message "0" is created
