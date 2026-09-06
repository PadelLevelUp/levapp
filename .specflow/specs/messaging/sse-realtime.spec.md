---
id: messaging.sse-realtime
status: implemented
depends_on: [messaging.messages]
implements: ../../specs-business/messaging/user-and-coach-message-in-real-time.business.md
governed_by: []
---

# messaging.sse-realtime


### Intent
Deliver real-time message updates to connected clients via Server-Sent Events.

### Rules
1. `GET /api/app/events` (JWT via query string) opens an SSE stream
2. In-memory pub/sub: `subscribe(user_id)`, `unsubscribe(user_id, q)`, `publish(event, user_ids)`
3. Events published: `message_created`, `message_edited`, `message_deleted`, `message_reaction`,
   plus the notification-engine events `notification_responded` and `notify_sent`
4. Each event is JSON with `{type, payload}`
5. Frontend `EventSource` consumes the stream and updates UI optimistically
6. On disconnect, client queue is cleaned up
7. A subscription is **keyed by the authenticated user id taken from the JWT** — the
   `/events` route registers its queue under `get_jwt_identity()`, never anonymously.
   One user may hold several queues (several tabs, web + phone); all of them receive
   that user's events
8. **Every published event names its recipient user ids** and is delivered only to
   their queues. For a message-shaped event the recipients are the participants of
   that message's conversation; for a notification-engine event they are the coach
   and the player the event is about. `user_ids` is a **required** argument of
   `publish()` — calling `publish(event)` raises `TypeError` rather than falling back
   to a broadcast (B-004)
9. A client never receives an event for a conversation it is not a participant of.
   Client-side filtering by conversation id is a rendering convenience, never the
   privacy boundary

### Acceptance Criteria

#### An event reaches only its named recipients
- **Given** users A, B and C are each connected to `/api/app/events`
- **And** a conversation whose participants are A and C
- **When** A sends a message in that conversation
- **Then** A's and C's queues receive the `message_created` event
- **And** B's queue receives nothing

#### A publish with no recipients is a programming error
- **Given** any event dict
- **When** `publish(event)` is called without `user_ids`
- **Then** it raises `TypeError` — the pre-B-004 broadcast behaviour is unreachable

#### Every queue of the same user is served
- **Given** user A has two open SSE connections
- **When** an event addressed to A is published
- **Then** both of A's queues receive it

### Notes
- In-memory only — does not persist across server restarts
- Single-server architecture (no Redis pub/sub for horizontal scaling). The registry is
  a per-process `dict[int, list[Queue]]`, which is why production runs one gunicorn
  worker: a second worker would hold its own registry and miss the fan-out
- Passing `user_ids=[]` delivers to nobody; that is a legitimate outcome (e.g. a
  conversation whose only participant was deleted), not a reason to broadcast
