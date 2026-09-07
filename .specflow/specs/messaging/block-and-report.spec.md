---
id: messaging.block-and-report
status: implementing
depends_on: [messaging.conversations, messaging.messages, messaging.conversation-detail]
implements: ../../specs-business/messaging/student-reaches-out-and-stays-safe.business.md
governed_by: []
---

# messaging.block-and-report

### Status (2026-09-06)
Rules 1–6 are **implemented** (App Store readiness plan, phase 3: `BlockedUser`,
`MessageReport`, `block_user_service`, `report_message_service`, web `ChatHeader` kebab and
`ReportMessageDialog`, iOS `chat-more-options-menu`) but were never specced — this leaf pins
them. Rules 7–10 (unknown-sender banner, report-and-block, blocked list in Settings) are
**draft**.

### Intent
Anyone can stop a conversation partner from reaching them, and can flag a message for the
operators. With student-to-student messaging by username (`messaging.conversations` rule 8), a
message from someone the recipient shares nothing with is clearly marked, and blocking or
reporting it is one tap away.

### Entities
- **READS/WRITES:** BlockedUser (`blocked_users`: blocker_id, blocked_id, unique pair),
  MessageReport (`message_reports`: reporter_id, message_id, reason)
- **READS:** Conversation, ConversationParticipant, Message, Association_CoachClub,
  Association_PlayerClub, Association_CoachPlayer

### Rules
1. `POST /api/app/users/<id>/block` creates a `BlockedUser(blocker=caller, blocked=id)`,
   idempotent; blocking yourself is 400. `DELETE` on the same path removes it, idempotent.
   `GET /api/app/blocked-users` lists the caller's blocks as `[{id, name}]`.
2. A block is enforced **both ways** on the server: `create_conversation_service` and
   `create_message_service` reject with 403 when either party has blocked the other.
3. Blocked users (either direction) are excluded from `GET /api/app/messageable-users`.
4. `POST /api/app/messages/<id>/report` `{reason?}` creates a `MessageReport`; only a
   participant of that message's conversation may report it (403 otherwise). Reports are
   reviewed through the generic editor (`/editor/MessageReport`, superadmin).
5. Thread UI on web and iOS offers **Block** / **Unblock** (conversation header menu) and
   **Report** (per-message action) with confirmation and a toast.
6. A blocked conversation stays in the list; its composer is replaced by "You blocked {name}"
   with Unblock. The blocked party is not told.
7. **Unknown sender.** `GET /api/app/conversation/<id>` returns `isKnownContact` for the viewer:
   `true` when the other participant is one of the viewer's coaches (`coach_in_player`), shares
   at least one club with them (via `coach_in_club` / `player_in_club`), or the viewer has sent
   at least one non-system message in the conversation; `false` otherwise. Group conversations
   are always `true`.
8. When `isKnownContact` is `false`, the thread renders a banner above the messages: "You don't
   share a club with {name}" with **Block** and **Report** actions. The banner disappears once
   the viewer sends a message or blocks. Web and iOS.
9. **Report** from the banner opens the existing report dialog pre-targeted at the most recent
   message from the other participant, with a preset reason `unsolicited` selectable; the dialog
   offers "Report and block", which performs rule 4 then rule 1.
10. Settings → Account (both roles, `settings.role-scope` rule 2) shows "Blocked users" from
    `GET /api/app/blocked-users` with Unblock per row. Web and iOS.

### Acceptance Criteria

#### Block prevents messages both ways
- **Given** users 1 and 5 with an existing conversation, and user 5 has blocked user 1
- **When** user 1 POSTs `/api/app/message` into that conversation
- **Then** the response is 403
- **And** user 5 POSTing a message is also 403

#### Blocked user leaves the picker
- **Given** a student who has blocked coach `C`
- **When** they GET `/api/app/messageable-users`
- **Then** `C` is absent from the list

#### Report requires participation
- **Given** message 50 in a conversation between users 1 and 5
- **When** user 9 POSTs `/api/app/messages/50/report`
- **Then** the response is 403 and no `message_reports` row exists
- **And** user 5 POSTing the same creates one row with `reporter_id = 5`

#### Unknown sender is flagged
- **Given** student `ana` and student `bruno` who share no coach and no club, and `bruno` started a conversation with `ana` by username
- **When** `ana` GETs `/api/app/conversation/<id>`
- **Then** `isKnownContact` is `false`
- **And** the thread on web shows the banner with Block and Report
- **And** the same banner renders on iOS

#### Coach is always a known contact
- **Given** student `ana` on coach Maria's roster and a conversation between them Maria started
- **When** `ana` opens it
- **Then** `isKnownContact` is `true` and no banner is shown

#### Replying clears the banner
- **Given** the unknown-sender conversation above
- **When** `ana` sends a message
- **Then** the next `GET` returns `isKnownContact: true` and the banner is gone

#### Report and block from the banner
- **Given** the unknown-sender conversation, `bruno`'s latest message being id 77
- **When** `ana` taps Report on the banner, keeps reason `unsolicited` and chooses "Report and block"
- **Then** a `message_reports` row exists for message 77 with reason `unsolicited`
- **And** a `blocked_users` row exists for (`ana`, `bruno`) and the composer shows "You blocked bruno"

#### Blocked list is manageable in Settings
- **Given** `ana` has blocked `bruno`
- **When** `ana` opens Settings → Account on web
- **Then** "Blocked users" lists `bruno` with Unblock, and unblocking removes the row
- **And** the same list exists on iOS

### Notes
- Decision: `.cortex/atlas/decisions/2026-09-06-open-registration-and-connections.md`, item 5.
- Code today: `padel_app/services/messaging_service.py` (`block_user_service`,
  `get_messageable_users_service`, `report_message_service`), routes in
  `padel_app/modules/frontend_api.py` (`/users/<id>/block`, `/blocked-users`,
  `/messages/<id>/report`), tests `padel_app/tests/test_messaging_report_block_scope.py`.
- OPEN: operator workflow beyond the editor (email on report, report counts). v1: none.
