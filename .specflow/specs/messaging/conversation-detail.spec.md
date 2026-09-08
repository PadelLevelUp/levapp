---
id: messaging.conversation-detail
status: implemented
depends_on: [messaging.conversations, messaging.messages]
implements: ../../specs-business/messaging/user-and-coach-message-in-real-time.business.md
governed_by: []
---

# messaging.conversation-detail


### Intent
View a single conversation — a page of its messages and its participant info — reading backwards
through the history without the thread ever moving under the reader.

### Rules
1. `GET /api/app/conversation/{id}` returns conversation + messages + participants, and pages the
   messages. It accepts `limit` (page size) and `before` (a message id, exclusive). With `limit`
   it returns the **newest** `limit` messages older than `before` — or simply the newest `limit`
   messages when `before` is absent — still ordered ascending within the page, alongside
   `hasMore: boolean` (are there older messages beyond this page) and `oldestMessageId` (the id to
   pass as the next `before`, `null` for an empty page). **Without `limit` the full history is
   returned unchanged**, with `hasMore: false` and `oldestMessageId` set: clients already in the
   field talk to prod (TestFlight build 8), and they send no `limit`. That unpaged branch is
   **deprecated** — it exists only for those builds and must not be used by new callers
2. Messages ordered by `sent_at` ascending — within a page as well as across the whole history.
   The page itself is selected newest-first (`sent_at DESC, id DESC`) and then reversed, so
   `limit` takes the newest messages rather than the oldest
3. Includes reaction data and reply chains
4. Frontend renders as scrollable message list with chat bubbles
5. Conversation payload includes the other participant's role (`participantRole`: `"coach"` or `"player"`), derived from `User.role`. When there is no other participant to derive it from, the payload degrades exactly as `messaging.conversations` rule 10 prescribes — `participantRole: null` alongside `participantDeleted: true` — rather than failing (B-024)
6. The chat header subtitle displays the participant's actual role (capitalized), not a hardcoded value
7. While the on-screen keyboard is open, the message composer stays docked directly above it with no gap, and the most recent message stays visible. On the native shell the `KeyboardAvoidingView` offset must equal the real distance between that view's bottom edge and the bottom of the screen — 0 for a full-height stack route — never a hardcoded constant, since React Native adds the offset to the avoided height rather than subtracting it
8. Reactions for a conversation's messages are loaded in **one** query for the whole thread
   (`selectinload`), not lazily per message. `serialize_message` reads `message.reactions` for
   every message it renders, so an unloaded relationship turns a 200-message thread into 200
   round trips; the detail endpoint eager-loads them up front instead. (`replyTo` is the raw
   `reply_to_id`, so the reply chain costs nothing extra.)
9. The thread **opens anchored at the newest message**, and **the list is not shown until it
   is anchored**. Until then the thread area shows a neutral placeholder — a blank surface or a
   skeleton — and never partially laid-out messages or a viewport in motion. Positioning the
   list while it is on screen does not satisfy this rule even with no animation and even if it
   ends at the right place: on the native shell the list commits rows incrementally, so every
   intermediate layout is something the user watches happen (B-027, then B-028 for the same
   complaint a second time). The reveal is driven by an **observed** end-of-content state, not
   by a delay — and carries a bounded fallback, so a measurement that never settles reveals the
   thread anyway rather than leaving it blank. The first page is small (`limit` 30) so the
   anchor is reached immediately; the rest of the history arrives by rule 11
10. While the viewport is **away from the bottom** (beyond a small threshold — roughly one
    bubble's height), **no content change moves it**: not a new incoming message, an edit, a
    reaction, a background refetch, the keyboard opening, or an image finishing layout. A "new
    messages" affordance appears instead, and tapping it returns to the bottom (web's
    `showScrollDown` button; the native shell needs the equivalent). While the viewport **is** at
    the bottom, an incoming message keeps it pinned there. The user's **own** sent message always
    scrolls to the bottom, wherever they were
11. Reaching the **top of the loaded messages** fetches the previous page (`before` =
    `oldestMessageId`) and prepends it with the viewport **anchored to the message that was at the
    top** — the reader's position over the text does not jump. A small loading indicator shows
    while the page is in flight, only one page is in flight at a time, and nothing is fetched once
    `hasMore` is false
12. Whenever the viewport is **more than about one screen height above the bottom**, a persistent
    **jump-to-bottom control** is shown (a chevron); activating it goes to the newest message.
    It is not conditional on anything having arrived — a reader who has simply scrolled a long
    way back can always get straight back. When messages *have* arrived unseen meanwhile it is
    the same control, carrying rule 10's "New messages" label, so the two never appear as two
    competing buttons. Both shells
13. The composer row is padded symmetrically: the space below the input equals the space above it. While the keyboard is open the row adds no extra bottom inset (the keyboard already covers the home indicator); while the keyboard is down the row clears the home indicator by the safe-area inset
14. The send control is an icon button with the same height as the single-line input, the standard button corner radius (not a circle), and the outline paper-plane glyph — identical on web and iOS

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

#### Composer row is symmetric above the keyboard
- **Given** a user viewing a conversation on the native iOS app with the keyboard open
- **When** they look at the composer row
- **Then** the gap between the input and the keyboard equals the gap between the input and the row's top border

#### Send button matches the input
- **Given** a user viewing a conversation on web or iOS
- **When** the composer shows a single-line input
- **Then** the send button is exactly as tall as the input, square with the standard button radius, and shows the outline paper-plane icon

#### Reactions load in one query, not one per message (PAD-204)
- **Given** a conversation with 30 messages, 10 of which carry a reaction
- **When** a participant GETs `/api/app/conversation/{id}`
- **Then** the reactions for the whole thread are fetched in a single statement
- **And** the number of SQL statements the endpoint issues does not grow with the number of
  messages in the thread

#### The newest page comes back first, and `before` walks backwards (PAD-208)
- **Given** a conversation seeded with 60 messages, numbered "msg-1" (oldest) to "msg-60" (newest)
- **When** a participant GETs `/api/app/conversation/{id}?limit=50`
- **Then** the response carries 50 messages — "msg-11" through "msg-60", ascending —
  with `hasMore: true` and `oldestMessageId` equal to the id of "msg-11"
- **And** when they then GET `/api/app/conversation/{id}?limit=50&before=<that id>`,
  the response carries the remaining 10 — "msg-1" through "msg-10", ascending — with
  `hasMore: false`
- **And** a GET with no `limit` still returns all 60 messages, for clients in the field

#### A scrolled-up viewport does not move when a message arrives (PAD-208)
- **Given** a participant reading a 60-message thread who has scrolled up, away from the bottom
- **When** the other participant sends a new message and it arrives over SSE
- **Then** the scroll position is unchanged (within a few pixels)
- **And** the "new messages" affordance is shown

#### Scrolling to the top loads older messages and keeps the anchor (PAD-208)
- **Given** the same participant with 50 of 60 messages loaded, scrolled to the top of them
- **When** the previous page is fetched and prepended
- **Then** all 60 messages are loaded
- **And** the message that was at the top of the viewport is still at the top of the viewport

#### No frame of the open shows the thread anywhere but the bottom (PAD-224)
- **Given** a conversation seeded with 200 messages
- **When** a participant opens it
- **Then** the very first painted frame that contains any message row has the thread scrolled to
  its maximum offset
- **And** no frame between the first message row appearing and the thread settling has a scroll
  offset below that maximum — nothing is ever seen travelling towards the bottom

#### Scrolled a long way up, the jump-to-bottom control returns you (PAD-224)
- **Given** a participant reading that 200-message thread who has scrolled about three screens
  up from the bottom, with no new message having arrived
- **Then** the jump-to-bottom control is visible
- **When** they activate it
- **Then** the thread is at the newest message

#### At the bottom there is no jump-to-bottom control (PAD-224)
- **Given** a participant who has just opened that thread and not scrolled
- **When** the thread is anchored at the newest message
- **Then** no jump-to-bottom control is shown
