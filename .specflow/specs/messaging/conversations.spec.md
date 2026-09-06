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
- **Conversation** (`conversations`): group_name, is_group (bool), participant_key (unique, indexed)
- **ConversationParticipant** (`conversation_participants`): conversation_id, user_id, joined_at, last_read_at

### Rules
1. `participant_key` = comma-separated sorted user IDs (e.g., "1,5,12") — ensures idempotent lookup
2. Creating a conversation first checks if one exists with the same participant_key
3. `is_group=True` allows group_name display
4. `last_read_at` per participant tracks read status
5. `GET /api/app/conversations` returns all user's conversations
6. `POST /api/app/conversation` finds or creates by participant list
<!-- rules 7-8 land in PAD-205 (coach messageable set; scope gates starting only) -->
9. A conversation and **all** of its `ConversationParticipant` rows are written in one
   transaction. A failure part-way through creation leaves nothing behind — never a
   committed conversation with a missing participant row (B-019)
10. `GET /api/app/conversations` never fails because of one malformed conversation. A
   conversation whose counterpart is missing (hard-deleted user, empty participant list, a
   row lost before rule 9 existed) serializes with `participantId: null`,
   `participantName: null`, `participantRole: null` and `participantDeleted: true`, and is
   still listed; every other conversation in the list is unaffected. Clients render their own
   localized "Deleted user" label from the flag — the server sends no display string, because
   there is no server-side i18n for serializer output. `serialize_conversation_detail`
   degrades identically (B-019)

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

#### Creation is all-or-nothing (B-019)
- **Given** user 1 creates a conversation with user 5
- **When** the second `ConversationParticipant` insert fails
- **Then** no `Conversation` row remains
- **And** no orphaned `ConversationParticipant` row remains

#### One malformed conversation does not break the list (B-019)
- **Given** user 1 has three conversations, one of which has no participant row for anyone
  but user 1
- **When** user 1 GETs `/api/app/conversations`
- **Then** the response is 200 and lists all three
- **And** the malformed one carries `participantId: null`, `participantName: null`,
  `participantRole: null` and `participantDeleted: true`
- **And** the other two are serialized normally

#### A conversation the caller has no row in still serializes (B-019)
- **Given** a conversation whose only participant row belongs to someone else
- **When** it is serialized for user 1
- **Then** serialization succeeds and `unreadCount` is computed as if user 1 had never read
  it, rather than raising
