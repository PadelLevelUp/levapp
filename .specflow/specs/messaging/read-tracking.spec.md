---
id: messaging.read-tracking
status: implemented
depends_on: [messaging.conversations]
implements: ../../specs-business/messaging/user-manages-unread-and-notifications.business.md
governed_by: []
---

# messaging.read-tracking


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
