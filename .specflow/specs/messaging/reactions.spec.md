---
id: messaging.reactions
status: implemented
depends_on: [messaging.messages]
implements: ../../specs-business/messaging/user-and-coach-message-in-real-time.business.md
governed_by: []
---

# messaging.reactions


### Intent
Users can add emoji reactions to messages, with toggle behavior.

### Entities
- **MessageReaction** (`message_reactions`): message_id, user_id, emoji (String 8)
- Unique constraint: (message_id, user_id, emoji)

### Rules
1. `POST /api/app/message/{id}/reaction` with `{"emoji": "👍"}` toggles the reaction
2. If reaction exists: remove it. If not: add it.
3. Multiple users can react with the same emoji
4. Same user can have multiple different emoji reactions on one message
5. SSE event published on reaction change, addressed to the participants of the
   message's conversation (messaging.sse-realtime rule 8)
6. Only a participant of the message's conversation may react to it; anyone else gets
   403 (messaging.messages rule 10)

### Acceptance Criteria

#### Toggle reaction on
- **Given** message 50 with no reactions from user 1
- **When** user 1 POSTs reaction `{"emoji": "👍"}`
- **Then** a MessageReaction is created

#### Toggle reaction off
- **Given** message 50 with a "👍" reaction from user 1
- **When** user 1 POSTs reaction `{"emoji": "👍"}` again
- **Then** the MessageReaction is deleted
