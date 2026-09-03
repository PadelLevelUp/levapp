---
id: messaging.conversation-detail
status: implemented
depends_on: [messaging.conversations, messaging.messages]
implements: ../../specs-business/messaging/user-and-coach-message-in-real-time.business.md
governed_by: []
---

# messaging.conversation-detail


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
