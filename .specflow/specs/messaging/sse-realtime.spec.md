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
2. In-memory pub/sub: `subscribe()`, `unsubscribe()`, `publish()`
3. Events published: `message_created`, `message_edited`, `message_deleted`, `reaction_toggled`
4. Each event is JSON with `{type, payload}`
5. Frontend `EventSource` consumes the stream and updates UI optimistically
6. On disconnect, client queue is cleaned up

### Notes
- In-memory only — does not persist across server restarts
- Single-server architecture (no Redis pub/sub for horizontal scaling)
- OPEN: No user-level event filtering — all events broadcast to all connected clients
