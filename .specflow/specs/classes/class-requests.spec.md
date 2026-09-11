---
id: classes.class-requests
status: implemented
depends_on: [classes.create, calendar.view, calendar.blocks, messaging.messages]
implements: ../../specs-business/classes/student-books-a-class.business.md
governed_by: []
---

# classes.class-requests

### Intent
A student asks a coach for a class at a time the coach is free (PAD-104). The coach accepts,
declines or proposes another time; a proposal goes back to the student. The requested slot is
held on the coach's calendar while the request is open.

### Entities
- **ClassRequest** (`class_requests`): player_id, coach_id, start_datetime, end_datetime (the slot
  currently on the table), note, status (`pending` — awaiting the coach | `countered` — the coach
  proposed another time, awaiting the student | `accepted` | `declined` | `withdrawn`),
  hold_block_id (the CalendarBlock holding the slot on the coach's calendar while open),
  lesson_id (the class created on accept), decided_at, decided_by (`coach` | `student`).

### Rules
1. **Free is inferred.** A coach's free blocks for a day are the day window (08:00–22:00) minus
   every class occurrence and every calendar block on the coach's calendar, minus the holds of
   other open requests. Only windows of at least 60 minutes that have not started are offered.
   `GET /app/class-requests/free-blocks?coachId&from&to` returns `[{date, startTime, endTime}]`
   in the calendar's own local wall-clock shape.
2. **Only a coach the student is rostered with** can be asked (`GET /app/class-requests/coaches`
   lists them). A request must sit inside a free block (re-checked server-side) and be at least
   30 and at most 180 minutes long.
3. **The slot is held.** Creating a request creates a `personal` CalendarBlock on the coach's
   calendar titled with the student's name; the hold follows the slot on a counter-proposal and
   is deleted when the request leaves `pending`/`countered`. The hold is a plain block the coach
   may see and even delete — deleting it does not decide the request.
4. **The coach decides**: `accept` creates a one-off `private` class (max 1 player) at the slot
   with the student enrolled, through the same path as "Add class"; `decline` closes the
   request; `propose {date, startTime, endTime}` moves the slot and turns the request
   `countered`. A coach with no club cannot accept (409 `NO_CLUB`, the class needs one).
5. **The student answers a proposal**: `accept-proposal` behaves exactly like the coach's accept
   (the class is created at the proposed slot); `decline-proposal` closes the request as
   `declined` with `decided_by: student`; `counter-proposal` sends another time back to the
   coach (rule 10). A student may `withdraw` while the request is `pending` or `countered`.
   **An accept names the slot it accepts (PAD-281 review):** `accept-proposal` and the coach's
   `accept` take an optional `{slot: {date, startTime, endTime}}`; when it is present and differs
   from the slot on the table the server answers `409 slot_changed` and books nothing, so an
   answer given to a stale bubble (cached list, second device, a push tapped late) can never
   book a time the person never saw. The bubbles always send the slot they show. Every deciding
   read of the request row takes a row lock (`with_for_update`, B-051 pattern).
6. **Every transition notifies the other side** through the coach ↔ student direct conversation
   (the request as a message from the student's side with coach push; accept / decline /
   proposal as system messages to the student; the student's answer back from the student's
   side) — the same channels invitations and cancellations already use. **The proposal is
   answerable where it is announced (PAD-281, B-077):** every class-request message carries
   `metadata.classRequest {id, status, kind, slot}`, and while the request's live status is
   still `countered` at that slot the proposal bubble on web and iOS offers Accept / Decline /
   Propose another time (the last opens the student's Availability section on that request).
   Once the status or the slot has moved on, the bubble shows the outcome instead, and a late
   answer degrades to the `409 not_countered` refusal, never an error page. The push for a
   proposal deep-links to the conversation, so it lands on those actions.
7. **Requests for the past are refused**, and a slot that is no longer free (another request or a
   class landed meanwhile) answers `409 slot_taken`.
8. **Times follow the class-time convention (PAD-256, option B; R-023).**
   - A slot is the Lisbon wall-clock the user typed, stored naive and serialised back unchanged,
     exactly as `classes.create` stores a class.
   - Free blocks are computed in the calendar's own `HH:MM` strings.
   - The module's one clock, `_now_wall_clock`, is the club's clock (`club_now_naive`). So today's
     free blocks start at the next quarter hour of Lisbon now, and a slot that has started on the
     club's clock is refused (rule 7). Before PAD-256 this clock was UTC, so in summer it offered
     and accepted slots that had started up to an hour earlier.
   - A service function's `now` is therefore a club wall-clock value. The request's `decided_at`
     is an event timestamp and is stored in UTC (`wall_to_utc_naive(now)`).
9. `GET /app/class-requests` lists the caller's own requests (a student's, or every request
   addressed to the coach), newest first, with `playerName` / `coachName`.
10. **The student counter-proposes (PAD-281).** `POST /app/class-requests/<id>/counter-proposal
    {date, startTime, endTime}` while the request is `countered`: the slot is validated exactly
    like a new request (rule 2 length, rule 7 past / free, the request's own hold excluded), the
    hold moves, the request turns `pending` again at the new slot and the coach is told (rule 6,
    kind `counter_proposal` from the student's side — named apart from the `countered` status,
    which means the opposite side is waiting). Rounds are unlimited: the coach may accept,
    decline or propose again, and so on — from the inbox or from that message's bubble, which
    offers the coach Accept / Decline / Propose another time the same way rule 6 offers the
    student (Propose opens the inbox on that request). Any other status answers `409 not_countered`; another
    student's request answers `403`. `GET /app/class-requests/free-blocks?…&excludeRequestId=<id>`
    leaves the caller's own hold out of the busy time so the picker can offer it.

### Acceptance Criteria

#### Free blocks are what the coach's calendar leaves open
- **Given** a coach with a class 10:00–11:00 and a calendar block 14:00–16:00 on a day
- **When** their student asks for that day's free blocks
- **Then** the answer is 08:00–10:00, 11:00–14:00 and 16:00–22:00

#### A request holds its slot
- **Given** a student sends a request for 11:00–12:00
- **When** another student asks for the same day's free blocks
- **Then** 11:00–12:00 is no longer offered
- **And** the coach's calendar shows a block for that slot

#### Accept creates the class and releases the hold
- **Given** a pending request
- **When** the coach accepts
- **Then** a private class at that slot exists with the student enrolled
- **And** the hold block is gone and the student is told

#### Counter-proposal round-trips
- **Given** a pending request for 11:00–12:00
- **When** the coach proposes 15:00–16:00
- **Then** the request is `countered`, the hold moved to 15:00–16:00 and the student is told
- **When** the student accepts the proposal
- **Then** the class exists at 15:00–16:00

#### The student counter-proposes and the loop continues
- **Given** a `countered` request at 15:00–16:00 (the coach's proposal)
- **When** the student proposes 17:00–18:00
- **Then** the request is `pending` at 17:00–18:00, the hold sits at 17:00–18:00 and the coach
  is told from the student's side
- **When** the coach accepts
- **Then** the class exists at 17:00–18:00
- **And** a student who answers a proposal that is no longer on the table is refused with
  `409 not_countered` and sees the outcome, not an error

#### A stale accept never books a slot the person did not see (PAD-281 review)
- **Given** the coach proposed 15:00, the student counter-proposed 17:00 and the coach proposed
  again at 19:00
- **When** the student accepts from the 15:00 bubble (`accept-proposal` with `slot` 15:00–16:00)
- **Then** the server answers `409 slot_changed`, the request stays `countered` at 19:00 and no
  class exists
- **When** the student accepts with `slot` 19:00–20:00
- **Then** the class is booked at 19:00

#### The proposal is answerable in chat
- **Given** the coach proposed 15:00–16:00 and the student opens the conversation
- **When** the proposal bubble renders
- **Then** it offers Accept, Decline and Propose another time
- **When** the student accepts from the bubble
- **Then** the request is `accepted` and the bubble shows "Class booked"

#### Decline and withdraw release the hold
- **Given** a pending request
- **When** the coach declines (or the student withdraws)
- **Then** the request closes and the hold block is deleted

#### Refusals
- **Given** a slot in the past, outside the coach's free time, or already held
- **When** a student requests it
- **Then** the server refuses with `409` and the matching `code`
