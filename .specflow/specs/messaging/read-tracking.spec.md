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

6. **(PAD-149)** Opening a conversation clears the nav unread badge **in the same session**,
   with no page reload. The order matters and is the whole rule: `handleSelectConversation`
   **awaits** `markConversationRead` before calling `refreshUnreadCount`, because
   `refreshUnreadCount` re-queries the server and firing it alongside an uncommitted mark-read
   reads back the pre-read count and leaves the badge stale. This was fixed under PAD-153
   (`a1c48d7`, 2026-09-02); PAD-149 is the acceptance criterion and regression test that keeps
   it fixed. `AppLayout`'s SSE listener deliberately skips `refreshUnreadCount` while the user
   is on `/messages/:id` so it cannot race the same sequence from the other side.
7. **(PAD-149)** The badge has exactly two render sites — the desktop sidebar and the mobile
   bottom nav — both driven by the same `LayoutContext.unreadCount`. They carry
   `data-testid="nav-unread-badge"` / `"bottom-nav-unread-badge"` so the behaviour can be
   asserted rather than inferred from a link's text, which changes as the badge itself changes.
   Rule 4's "periodically" is not what the code does: the count is refreshed on mount and on an
   SSE `message_created` outside an open thread, not on a timer.

### Acceptance Criteria

#### Mark conversation read
- **Given** user 1 has 5 unread messages in conversation 10
- **When** they POST to `/api/app/conversation/10/read`
- **Then** `last_read_at` is updated to now
- **And** the unread count for conversation 10 becomes 0

#### Nav unread badge clears when the conversation is opened, without a reload
- **Given** a signed-in coach with exactly one unread message, on `/messages`
- **Then** the nav unread badge is visible and reads `1`
- **When** they open the conversation containing that message
- **Then** the nav unread badge disappears without the page being reloaded
- **And** it is still absent after the thread has settled

