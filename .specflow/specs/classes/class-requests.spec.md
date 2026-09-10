---
id: classes.class-requests
status: implementing
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
   `declined` with `decided_by: student`. A student may `withdraw` while the request is
   `pending` or `countered`.
6. **Every transition notifies the other side** through the coach ↔ student direct conversation
   (the request as a message from the student's side with coach push; accept / decline /
   proposal as system messages to the student; the student's answer back from the student's
   side) — the same channels invitations and cancellations already use.
7. **Requests for the past are refused**, and a slot that is no longer free (another request or a
   class landed meanwhile) answers `409 slot_taken`.
8. `GET /app/class-requests` lists the caller's own requests (a student's, or every request
   addressed to the coach), newest first, with `playerName` / `coachName`.

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

#### Decline and withdraw release the hold
- **Given** a pending request
- **When** the coach declines (or the student withdraws)
- **Then** the request closes and the hold block is deleted

#### Refusals
- **Given** a slot in the past, outside the coach's free time, or already held
- **When** a student requests it
- **Then** the server refuses with `409` and the matching `code`
