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
  lesson_id (the class created on accept), decided_at, decided_by (`coach` | `student`);
  PAD-357 (migration `8da963ad8591`, both nullable): `invitee_player_ids` (JSON list of player
  ids the requester brings, 0–3) and `recurrence` (JSON `{weekdays: [1..7, Monday = 1],
  startDate, endDate}` for a weekly request; null for a single class).
- **READS:** `classes.availability` (the free windows), Coach.working_hours
  (`settings.coach-working-hours`), Association_CoachPlayer (the roster).

### Rules
1. **Free is inferred.** A coach's free blocks for a day are the coach's working windows for
   that day (`settings.coach-working-hours`; 08:00–22:00 until the coach sets any) minus every
   class occurrence and every calendar block on the coach's calendar, minus the holds of other
   open requests. Only windows of at least 60 minutes that have not started are offered. This
   is the one computation (`classes.availability`, with nobody else's calendar subtracted) that
   free-blocks, a request, a proposal, a counter-proposal and an accept all read — a coach who
   sets hours gets one answer everywhere (PAD-357, #338 review F2).
   `GET /app/class-requests/free-blocks?coachId&from&to` returns `[{date, startTime, endTime}]`
   in the calendar's own local wall-clock shape.
2. **Only a coach the student is rostered with** can be asked (`GET /app/class-requests/coaches`
   lists them). A request must sit inside a free block (re-checked server-side) and be at least
   30 and at most 180 minutes long.
3. **The slot is held.** Creating a request creates a `personal` CalendarBlock on the coach's
   calendar titled with the student's name; the hold follows the slot on a counter-proposal and
   is deleted when the request leaves `pending`/`countered` — or goes away any other way (rule
   18). The hold is a plain block the coach may see and even delete — deleting it does not decide
   the request.
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
11. **The booking form opens on the first day with a free block (PAD-302; rule number
    self-assigned, unconfirmed).** Once the student has picked a coach, the form's date
    defaults to the earliest day — today if any block remains, else the next day in the coming
    14 days — for which `free-blocks` returns a block, so the student never lands on an empty
    slot picker late in the day. The date stays editable, and a date the student has typed is
    never overridden by a later coach change. `firstFreeDay()` in `packages/config` is the one
    derivation, shared by both shells.

12. **People (PAD-357, "Quem vai contigo").** A request names 1–4 people: the requester plus
    0–3 invitees given by exact username. **"Connection" for this feature means: the invitee is
    on the chosen coach's roster** (`Association_CoachPlayer`), has an active account with a
    real username (not a placeholder, has a password — the checks
    `messaging_service._resolve_direct_username` applies), and is not the requester. There is no
    player-to-player connection in the product (decision
    `2026-09-06-open-registration-and-connections`: no player↔player links, no student search),
    so this roster test is the whole meaning of "já existe ligação"; the wizard says "só podes
    adicionar jogadores que já treinam com este treinador". Usernames resolve one at a time
    through `GET /app/availability/participants?coachId&usernames=a,b` → `[{username, ok:
    true, playerId, name} | {username, ok: false, code}]`, and the request itself re-validates
    them. Refusals, one code each and never an oracle: `404 USERNAME_NOT_FOUND` for unknown,
    placeholder, inactive or not-on-this-roster usernames alike; `400 SELF_INVITE`;
    `400 TOO_MANY_PEOPLE` (more than 4 including the requester); `409 DUPLICATE_INVITEE`.
13. **Free is everyone's free (PAD-357).** For a request the free windows come from
    `classes.availability` (the coach's working time minus the coach's classes, blocks and
    other requests' holds, minus the requester's and every invitee's classes and unavailability
    blocks), and rule 2's "inside a free block" is checked against those windows server-side —
    for a weekly request, on every occurrence date. A person's classes are their calendar's
    projection: every occurrence of a series they are on, materialised or not, plus the
    materialised occurrences they hold a presence on — never Presence rows alone, because a
    future occurrence gets its Presence only when it materialises (#338 review F1). Durations
    offered are `CLASS_REQUEST_DURATIONS` (60, 90, 120 min), default 60. The coach's own
    free-blocks endpoint (rule 1) reads the same windows.
14. **A weekly request is one request (PAD-357).** `recurrence = {weekdays, startDate, endDate}`
    with `startDate ≤ endDate`, at least one weekday, `date` = the first occurrence; the hold
    (rule 3) is one recurring CalendarBlock covering every occurrence; a proposal or
    counter-proposal moves the series per rule 16 (the hold follows). The coach's
    `accept` creates **one** weekly `private` Lesson series (`isRecurring`, `recurrenceRule
    {frequency: "weekly", daysOfWeek}`, `endDate`, one identity under `classes.recurrence` rule 6)
    with `maxPlayers` = the number of people and every person enrolled through `enrol()`; a
    single request creates the one-off exactly as before with the same roster. The requester
    is told by the accept message as today; **each invitee is told they were added** through
    PAD-330's enrolment notice (`notifications.reminders` rule 18 keeps them asked). Invitees
    never accept or decline anything.
15. **Requests for the past are refused per occurrence** (rule 7): a weekly request whose
    first occurrence has started is refused at submission; a later occurrence that is no longer
    free answers `409 slot_taken` naming the date. At accept time rule 17 applies.
16. **A proposal or counter-proposal on a weekly or group request re-validates everyone and
    stays on the series' weekdays (PAD-357, #338 review F3).** The coach's `propose` and the
    student's `counter-proposal` (rules 4 and 10) are validated exactly like the request
    (rule 13: every person, and on a weekly request every occurrence). On a weekly request the
    proposed date must fall on one of its `weekdays` and not after `endDate` — otherwise
    `409 off_series` (`weekdays` in the body) — and the series **re-anchors**: `startDate`
    becomes the proposed date, `date` and the hold follow, the weekday set and `endDate` are
    unchanged. A countered date never changes the weekday pattern; a different pattern is a new
    request.
17. **Accepting a weekly request after its first occurrence has started (PAD-357, #338 review
    F4).** Occurrences that have already started at accept time are skipped: the series starts
    at the first future occurrence (`startDate`, `date` and the created Lesson's start move
    there, `endDate` unchanged) and only the future occurrences are re-validated. Only when no
    occurrence is left does accept answer `409 in_the_past`, and the request stays open for the
    coach to decline.
18. **The hold a request points at never outlives it (PAD-360, B-135).** Rule 3 names the status
    transitions; the same is true however the request goes away — for the block in
    `hold_block_id`. A block cloned from a hold is a known gap (last bullet). Before PAD-360 only withdraw, decline and
    accept released the hold, and every path below left a ghost block on the coach's calendar.
    - **The row is deleted.** Deleting a ClassRequest through the ORM — both generic editor
      routes, `DELETE /api/editor/classrequest/<id>` and `POST /api/delete/classrequest/<id>` —
      deletes its hold block in the same flush.
    - **The row is cascaded away.** Deleting a Player or a Coach row takes their requests with
      it inside the database (`ON DELETE CASCADE`), where no hook on the request runs; the holds
      of those requests are deleted first.
    - **The person deletes their account** (`auth.account-deletion` rules 6 and 10). A deleting
      student's open requests close as `withdrawn` / `decided_by: student`; a deleting coach's
      close as `declined` / `decided_by: coach`; the hold is released. Both are **silent — no
      notification in either direction** (rule 6 does not apply: one side no longer exists). A
      deleting student is also taken off `invitee_player_ids` of other people's open requests,
      so an accept never enrols a deleted account.
    - **The row is closed by an edit.** The admin editor can PATCH `status` straight to a closed
      value; any ORM update that leaves a request closed while it still points at a hold deletes
      the hold. An edit that leaves the request open keeps it (#345 review F7).
    - **The import is reverted.** `revert_import` bulk-deletes the players it created with
      `Query.delete()`, which runs no ORM hook, and an imported student can have activated in
      place and asked for a class. The revert releases those players' holds first (#345 review
      F1). No other bulk delete of players or coaches exists today; a new one must do the same.
    - **Known gap — a moved occurrence of a weekly hold (#345 review F2, not fixed here).**
      Moving one occurrence of a recurring hold (`calendar_service.reschedule_block_service`)
      clones the block: the clone copies the hold's title and no request points at it, so no
      path above releases it, and it outlives the request under the student's name. It follows
      that a hold-titled block no request references may be the clone of a LIVE hold — a cleanup
      must never delete one on its title alone. Pinned as a known gap in
      `test_pad360_request_hold_release.py`; its own ticket.
    - **Left out on purpose:** a coach **disconnecting** a student leaves the open request and
      its hold in place (the hold is legitimate while the request is open); whether a disconnect
      should decline it is an owner decision, recorded on PAD-360. A pending request whose slot
      has passed keeps its hold — there is no expiry; also with the owner.
    - **No client change (web and iOS).** Both already render `withdrawn` and `declined`; nothing
      new reaches a screen, so PAD-360 ships backend-only.

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

#### The form opens on a day that still has free time (PAD-302)
- **Given** the coach's calendar is blocked from 08:00 to 22:00 today
- **When** the student opens "Book a class" and picks that coach
- **Then** the date is the first later day with a free block and the slot list is not empty
- **And** typing another date keeps the typed date

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

#### Deleting a request deletes its hold (PAD-360, rule 18)
- **Given** a pending request with its hold on the coach's calendar
- **When** a superadmin deletes the request through `DELETE /api/editor/classrequest/<id>` (or the
  legacy `POST /api/delete/classrequest/<id>`)
- **Then** the request is gone and so is the hold block
- **And** a calendar block of the coach's own on the same day is untouched

#### Deleting the player or the coach deletes their requests' holds (PAD-360, rule 18)
- **Given** a pending request with its hold
- **When** the Player row (or the Coach row) is deleted and the database cascades the request away
- **Then** the hold block is gone too

#### Account deletion closes open requests silently (PAD-360, rule 18)
- **Given** Bruno has a pending request to coach Ana, and is an invitee on Carla's pending request
- **When** Bruno deletes his account
- **Then** his request is `withdrawn` by `student`, its hold is gone, and Ana receives no message
- **And** Carla's request stays `pending` with its hold, without Bruno among its invitees
- **Given** instead coach Ana deletes her account
- **Then** Bruno's request is `declined` by `coach`, and Bruno receives no message
- **And** a request that was already `accepted` or `declined` is not touched by either deletion

#### Refusals
- **Given** a slot in the past, outside the coach's free time, or already held
- **When** a student requests it
- **Then** the server refuses with `409` and the matching `code`

#### A group request names only people who train with the coach (PAD-357)
- **Given** coach Ana's roster holds Bruno and Carla, and Diogo is a player of another coach
- **When** Bruno asks Ana for a private class with `participants: ["carla"]`
- **Then** the request is created with Carla as invitee and the wizard's participant check answers `ok: true` for "carla"
- **When** Bruno names "diogo" or "bruno"
- **Then** the check answers `USERNAME_NOT_FOUND` for "diogo" and `SELF_INVITE` for "bruno", and a request naming them is refused with the same codes

#### Free windows subtract the invitee's calendar (PAD-357)
- **Given** Ana is free 08:00–22:00 on a day, Bruno has nothing, and Carla has a class 10:00–11:00 and an unavailability block 18:00–20:00
- **When** Bruno asks for availability with `participants: ["carla"]`
- **Then** the free windows for that day are 08:00–10:00, 11:00–18:00 and 20:00–22:00

#### A weekly request becomes one series on accept (PAD-357)
- **Given** Bruno's weekly request Tue+Thu 18:00–19:00 from 2026-10-06 to 2026-10-29 with Carla
- **When** Ana accepts
- **Then** exactly one `private` Lesson exists, recurring weekly on Tue and Thu with `recurrence_end` 2026-10-29 and `max_players` 2, Bruno and Carla enrolled on its occurrences
- **And** Carla receives the "added to a class" notice; the request is `accepted` with that lesson's id; the recurring hold block is gone

#### A weekly request is held on every occurrence (PAD-357)
- **Given** the same pending weekly request
- **When** another student asks for Ana's free blocks on 2026-10-13 (a Tuesday)
- **Then** 18:00–19:00 is not offered

#### An invitee's unmaterialised series occurrence is busy (PAD-357, rule 13)
- **Given** Carla is on the roster of Ana's weekly academy class Tuesdays 18:00–19:00 and next Tuesday's occurrence is not materialised
- **When** Bruno asks for availability with `participants: ["carla"]` for that Tuesday, or requests it 18:00–19:00 with Carla
- **Then** 18:00–19:00 is not in the free windows and the request is refused `409 slot_taken`
- **And** nothing was materialised by either check; the same slot with Carla at 19:00–20:00 is accepted

#### Free blocks, requests and proposals follow the coach's working hours (rule 1)
- **Given** Ana has set Tuesday to 09:00–13:00
- **When** free blocks are asked for a Tuesday, Bruno requests 18:00–19:00, and Ana proposes 21:00–22:00 on a 10:00 request
- **Then** the only block is 09:00–13:00, the request and the proposal are refused `409 slot_taken`, and a proposal at 11:00–12:00 is accepted

#### A proposal on a weekly request stays on its weekdays and rechecks everyone (rule 16)
- **Given** Bruno's pending weekly Tue+Thu 18:00–19:00 request with Carla, and Carla has a class on the third Thursday 20:00–21:00
- **When** Ana proposes a Wednesday
- **Then** the answer is `409 off_series`
- **When** Ana proposes Thursday 20:00–21:00
- **Then** the answer is `409 slot_taken` naming the third Thursday
- **When** Ana proposes Thursday 19:00–20:00
- **Then** the request is `countered`, `recurrence.startDate` is that Thursday with the same weekdays and end date, and the recurring hold starts there
- **And** Bruno's counter-proposal obeys the same rule from his side

#### Accepting a weekly request after its first occurrence starts at the next one (rule 17)
- **Given** Bruno's pending weekly Tuesday 18:00–19:00 request over four Tuesdays, and the first Tuesday's 18:00 has passed
- **When** Ana accepts
- **Then** one series is created starting the second Tuesday with the same end date, and the request's `date` and `recurrence.startDate` moved to it
- **When** every occurrence has passed
- **Then** accept answers `409 in_the_past` and the request stays `pending`

