---
id: messaging.direct-by-username
status: implemented
depends_on: [messaging.conversations, messaging.block-and-report, auth.register]
implements: ../../specs-business/messaging/student-reaches-out-and-stays-safe.business.md
governed_by: []
---

# messaging.direct-by-username

### Intent
Anyone can open a conversation with any other user by typing that user's exact username — no
roster, no shared club, no request to accept. Knowing the username is the consent signal; the
safety net on the other side is `messaging.block-and-report`. Discovery stays limited: the picker
only ever lists people you are already connected with.

*Amended 2026-09-07 after TestFlight feedback (owner): "creating new conversations is with any
user, not just with students — if you have someone's username you can message them; you just
can't search for usernames unless you are already connected."*

### Entities
- **READS:** User, Player, Coach, BlockedUser
- **WRITES:** Conversation, ConversationParticipant (through `messaging.conversations`)

### Rules
1. `POST /api/app/conversation` accepts `otherUsername` **instead of** `otherParticipants`
   (both present → 400). Any signed-in user — coach or student — may use it.
2. The server resolves `otherUsername` to exactly one User: case-insensitive exact match on
   `users.username`, `status = active`, coach or student, and not the caller. Placeholder
   accounts (`pending-…`, never activated) never match. No prefix matching, no search.
3. An unknown username, an inactive or placeholder account, the caller's own username, and
   a target who has blocked the caller **all answer 404 with the same body**
   (`{"error": "No user with that username"}`), so a block is not detectable. The caller having
   blocked the target answers 403 exactly as `messaging.block-and-report` rule 2.
4. On success the flow is `messaging.conversations` rule 6 unchanged: find-or-create by
   `participant_key`, 1:1, response identical to the participant-list path.
5. The recipient's copy of the conversation carries `isKnownContact: false` until they reply or
   share a club (`messaging.block-and-report` rule 7), which is what renders the banner.
6. UI: the "new message" screen has a **"Message by username"** field for every role beside the
   connected-users picker — web `NewConversationDialog`, iOS `conversation/new`. No
   autocomplete. On 404 it shows "No user with that username".
7. **Discovery stays connection-scoped.** The picker (`GET /api/app/messageable-users`) lists only
   people the caller is already connected with — a coach's roster and club players, a student's
   coaches — and its search box filters that list by name on both platforms. There is no endpoint
   that searches users by name or username beyond that list.
8. The iOS new-conversation screen mirrors the web dialog: a search field over the connected list
   at the top, the list itself, and the "Message by username" section below — same order, same
   copy, same empty states.

### Acceptance Criteria

#### Student starts a conversation by exact username
- **Given** students `ana` (user 7) and `bruno` (user 9) with no prior conversation, no shared club, no block
- **When** `ana` POSTs `/api/app/conversation` with `{"otherUsername": "Bruno"}`
- **Then** a Conversation exists with `participant_key` "7,9" and two participants
- **And** `bruno`'s `GET /api/app/conversations` now includes it

#### Unknown, placeholder, self and blocked usernames are indistinguishable
- **Given** no user `nobody`, a never-activated placeholder account `pending-abc`, and student `carla` who has blocked `ana`
- **When** `ana` POSTs `/api/app/conversation` with `otherUsername` `nobody`, then `pending-abc`, then `ana`, then `carla`
- **Then** each response is 404 with the same body and no Conversation was created

#### A student reaches a coach, and a coach reaches anyone, by username
- **Given** coach `maria` (not one of `ana`'s coaches) and coach `rui`
- **When** `ana` POSTs with `otherUsername: "maria"`, and `rui` POSTs with `otherUsername: "ana"` and then with `otherUsername: "maria"`
- **Then** each response is 201 and a 1:1 conversation exists for each pair

#### Caller's own block is a 403
- **Given** `ana` has blocked `bruno`
- **When** `ana` POSTs with `otherUsername: "bruno"`
- **Then** the response is 403

#### Both keys at once is rejected
- **When** a student POSTs with both `otherUsername` and `otherParticipants`
- **Then** the response is 400

#### Username field on both platforms, for every role
- **Given** a student on the web Messages screen starting a new conversation
- **When** they type `bruno` into "Message by username" and submit
- **Then** the conversation with `bruno` opens and the first message can be sent
- **And** a coach sees the same field, and both exist on the iOS new-conversation screen

#### Picker search filters connected users on iOS
- **Given** a coach on the iOS new-conversation screen with players `Ana` and `Bruno` on the roster
- **When** they type `an` into the search field
- **Then** the list shows `Ana` and not `Bruno`, and the "Message by username" section is still below the list

### Notes
- Decision: `.cortex/atlas/decisions/2026-09-06-open-registration-and-connections.md`, item 5 —
  replaces PAD-137's pending-request model for student↔student.
