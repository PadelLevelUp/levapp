---
id: messaging.direct-by-username
status: draft
depends_on: [messaging.conversations, messaging.block-and-report, auth.register]
implements: ../../specs-business/messaging/student-reaches-out-and-stays-safe.business.md
governed_by: []
---

# messaging.direct-by-username

### Intent
A student can open a conversation with another student by typing that student's exact username —
no roster, no shared club, no request to accept. Knowing the username is the consent signal; the
safety net on the other side is `messaging.block-and-report`.

### Entities
- **READS:** User, Player, Coach, BlockedUser
- **WRITES:** Conversation, ConversationParticipant (through `messaging.conversations`)

### Rules
1. `POST /api/app/conversation` accepts `otherUsername` **instead of** `otherParticipants`
   (both present → 400). Only a caller with a Player row and no Coach row may use it; a coach
   sending it is 400.
2. The server resolves `otherUsername` to exactly one User: case-insensitive exact match on
   `users.username`, `status = active`, has a Player row, has no Coach row, and is not the
   caller. No prefix matching, no search.
3. An unknown username, an inactive account, a coach's username, the caller's own username, and
   a target who has blocked the caller **all answer 404 with the same body**
   (`{"error": "No user with that username"}`), so a block is not detectable. The caller having
   blocked the target answers 403 exactly as `messaging.block-and-report` rule 2.
4. On success the flow is `messaging.conversations` rule 6 unchanged: find-or-create by
   `participant_key`, 1:1, response identical to the participant-list path.
5. The recipient's copy of the conversation carries `isKnownContact: false` until they reply or
   share a club (`messaging.block-and-report` rule 7), which is what renders the banner.
6. UI: the student's "new message" screen gains a **"Message by username"** field beside the
   coach picker — web `MessagesPage` new-conversation panel, iOS `conversation/new`. No
   autocomplete. On 404 it shows "No user with that username". Coaches do not see the field.

### Acceptance Criteria

#### Student starts a conversation by exact username
- **Given** students `ana` (user 7) and `bruno` (user 9) with no prior conversation, no shared club, no block
- **When** `ana` POSTs `/api/app/conversation` with `{"otherUsername": "Bruno"}`
- **Then** a Conversation exists with `participant_key` "7,9" and two participants
- **And** `bruno`'s `GET /api/app/conversations` now includes it

#### Unknown, coach, self and blocked usernames are indistinguishable
- **Given** no user `nobody`, coach `maria`, and student `carla` who has blocked `ana`
- **When** `ana` POSTs `/api/app/conversation` with `otherUsername` `nobody`, then `maria`, then `ana`, then `carla`
- **Then** each response is 404 with the same body and no Conversation was created

#### Caller's own block is a 403
- **Given** `ana` has blocked `bruno`
- **When** `ana` POSTs with `otherUsername: "bruno"`
- **Then** the response is 403

#### Coach cannot use the username path
- **Given** an authenticated coach
- **When** they POST `/api/app/conversation` with `{"otherUsername": "ana"}`
- **Then** the response is 400

#### Both keys at once is rejected
- **When** a student POSTs with both `otherUsername` and `otherParticipants`
- **Then** the response is 400

#### Username field on both platforms
- **Given** a student on the web Messages screen starting a new conversation
- **When** they type `bruno` into "Message by username" and submit
- **Then** the conversation with `bruno` opens and the first message can be sent
- **And** the same field exists on the iOS new-conversation screen, and a coach sees no such field on either

### Notes
- Decision: `.cortex/atlas/decisions/2026-09-06-open-registration-and-connections.md`, item 5 —
  replaces PAD-137's pending-request model for student↔student.
