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
7. **Who may start a conversation** is enforced in `create_conversation_service` and mirrored by
   the picker (`GET /api/app/messageable-users`): a **coach** may start one with any player of
   any club the coach belongs to; a **student** may start one with any active coach. Both are
   implemented today (`_messageable_target_ids_for`). A block in either direction refuses the
   conversation (403) — see `messaging.block-and-report`.
8. Students are never listed: `GET /api/app/messageable-users` for a student returns coaches
   only; there is no endpoint that lists or searches students by name or username. The
   student-to-student path by exact username is `messaging.direct-by-username`.
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

#### Students are not discoverable
- **Given** an authenticated student
- **When** they GET `/api/app/messageable-users`
- **Then** every entry has role `coach`; no student appears

#### Coach reach is unchanged
- **Given** coach Maria in club 1 and student `dora` who is in club 2 only
- **When** Maria POSTs `/api/app/conversation` with `{"otherParticipants": [<dora.user_id>]}`
- **Then** the response is 403
