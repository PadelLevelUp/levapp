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
7. A coach may start a conversation with any player on their **roster** (`coach_in_player`) or in
   any **club** they belong to (`player_in_club`) — the union of the two is the coach's
   messageable set. Everyone else is a student and may start a conversation with any active coach.
   The same set backs both `GET /api/app/messageable-users` (the picker) and the 403 guard on
   `POST /api/app/conversation`. Blocks, either way, remove a user from it.
8. The scope in rule 7 governs **starting** a conversation only. It never restricts sending inside
   a conversation that already exists.

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

#### Coach messages a player they added in the app
- **Given** coach C added player P through the app, so P has a `coach_in_player` row for C and no
  `player_in_club` row for any of C's clubs
- **When** C requests `GET /api/app/messageable-users`, or POSTs a conversation with P
- **Then** P appears in the list, and the conversation is created

#### Coach messages a player who is only in their club
- **Given** player Q is in a club C belongs to but has no `coach_in_player` row for C
- **When** C requests `GET /api/app/messageable-users`
- **Then** Q still appears in the list

#### Coach cannot message an unrelated player
- **Given** player R is neither on C's roster nor in any club C belongs to
- **When** C POSTs a conversation with R
- **Then** the request is rejected with 403, and R never appeared in C's messageable list
