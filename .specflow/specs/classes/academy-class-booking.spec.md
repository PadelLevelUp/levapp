---
id: classes.academy-class-booking
status: draft
depends_on: [eligibility.open-spot-visibility, eligibility.cascade, classes.join-requests, notifications.waiting-list, classes.instances]
implements: ../../specs-business/classes/student-joins-and-views-classes.business.md
governed_by: []
---

# classes.academy-class-booking

### Intent
The "Marcar Aula" wizard (PAD-357) offers a second path beside a private class: **join one of the
coach's academy classes**. The student picks the coach, then sees that coach's classes for the next
fourteen days — only the ones they may join — and acts on each according to its state: a class with
room is **requested** (with an optional note to the coach), a full class is **joined on its waiting
list**. Nothing here is a new booking mechanism: the request is a `classes.join-requests` request and
the waiting-list place is a `notifications.waiting-list` entry. This leaf is the student-facing entry
point that composes them (PAD-358).

### Entities
- **ClassJoinRequest** gains **`note`** (text, nullable, ≤ 500 characters after trimming) — the
  student's optional message to the coach. The column rides on PAD-357's migration.
- No other entity changes. A waiting-list place is a `WaitingListEntry` with
  `standing_entry_id IS NULL` (the student's own, `notifications.waiting-list` rule 10).

### Rules
1. **One coach, fourteen club-local days.** The list covers the club's calendar days from today
   00:00 to today + 14 00:00 (R-023: class times are Lisbon wall-clock, "today" is the club's date).
   Classes that have already started on the club's clock are not listed.
2. **Only classes the student may join are listed** — each must pass every condition the join
   request itself checks (`classes.join-requests` rule 1), except having room:
   - the student is on the coach's roster (otherwise the whole read is refused);
   - open spots are visible for the class (`effective_open_spots_visible`, the coach's toggle
     cascaded per `eligibility.open-spot-visibility` rule 3). With the toggle off the step is empty
     and says the coach does not take requests for academy classes;
   - the student passes the class's eligibility bar (`eligibility.cascade`, the PAD-352 rules
     unchanged);
   - the class is not cancelled or completed, and the student is not already enrolled in it.
3. **Each listed class carries one state**, computed with the class's existing capacity measure
   (`eligibility.open-spot-visibility` rule 4, PAD-275 `effective_max_players`):
   - **open** — `effective_filled_spots < effective_max_players`; `spotsLeft` is the difference.
     For a never-materialised occurrence the filled count is the series enrolment.
   - **full** — otherwise; `spotsLeft` is 0.
4. **The read writes nothing.** Listing materialises no occurrence and creates no row
   (`eligibility.open-spot-visibility` rule 5). Materialisation happens only when the student acts
   (rules 5–6), exactly as `classes.join-requests` rule 2.
5. **Open → request, with an optional note.** The action is `classes.join-requests`' own create
   (its rules 1–3, 14, 15 unchanged), with the note attached. The coach sees the note in the
   request's mirrored chat message and on the class's pending requests. A request for a class that
   filled up meanwhile is refused `spot_filled`, and the student is offered the waiting list.
6. **Full → join the waiting list, by the student.** A student may place **themselves** on a full
   class's waiting list from this step. The server re-checks rule 2 and that the class is full, then
   upserts their active `WaitingListEntry` (reactivating an inactive one, never a second row). The
   coach is told exactly as a join request tells them: a message in the coach ↔ student
   conversation, a web push and an iOS push that open that thread, and a realtime
   `waiting_list_joined` event to the coach.
   Placement from the list stays `notifications.waiting-list` rules 4–4d and 13 — this rule adds an
   entry, it never places anyone.
7. **Each class shows what the student already did**: their latest join request for it (and its
   status) and whether they are on its waiting list. A class they have a pending request for, or are
   on the waiting list of, shows that status instead of the action. **Every place the list reports,
   the student can leave** — whatever put them there, their own join or the coach's standing list
   (`notifications.waiting-list` rule 10); leaving removes that class's entry only and leaves the
   standing entry itself untouched.
8. **Additive API only.** Old App Store builds never call these endpoints; nothing existing changes
   shape. The endpoints are new, so they are not gated by `X-LevApp-Capabilities` (PAD-352 gates
   an existing response, the calendar's).
9. **Wire contract (PAD-358).**
   - `GET /api/app/academy-classes?coachId=<coach id>` — student only; `403` when the student is not
     on that coach's roster, `400` without `coachId`. → `200 {from: "YYYY-MM-DD", to: "YYYY-MM-DD",
     openSpotsVisible: boolean, classes: [...]}` sorted by start. `openSpotsVisible` is the coach's
     standard toggle, so an empty list can say why (rule 2). Each class is the calendar event
     (`serialize_calendar_event`: `id`, `model`, `originalId`, `date`, `startTime`, `endTime`,
     `title`, `color`, `maxPlayers`, `participantCount`, `confirmedCount`, `club`, `court`,
     `classType`, `levelId`, `isRecurring`) plus `coachName`, `state` (`"open"` | `"full"`),
     `spotsLeft`, `myJoinRequest` (`{id, status}` of the latest request, or `null`) and
     `onWaitingList` (boolean).
   - `POST /api/app/class-join-requests` accepts an optional `note` (rule 5); a note over 500
     characters answers `400`. The coach's `joinRequests[]` items carry `note`.
   - `POST /api/app/class-waiting-list` `{model, originalId, date}` → `201 {lessonInstanceId,
     onWaitingList: true}`, or `200` with the same body when the entry was already active. Refusals
     are `409` with a `code`: `already_enrolled`, `class_closed`, `not_visible`, `ineligible`,
     `has_spots` (the class has room: request it instead).
   - `POST /api/app/class-waiting-list/<lessonInstanceId>/leave` → `200 {lessonInstanceId,
     onWaitingList: false}`; deactivates the caller's active entry for that class, whatever its origin
     (rule 7); `404` when they have none.
10. **Both shells, same step.** Web and iOS render the same list: grouped by day, an open class with
    its spots left and the request action, a full class marked with the destructive token ("in red")
    and the waiting-list action. Identifiers are stable test ids (`academy-class-*`); on iOS the state
    is part of the id (`academy-class-row-open` / `-full`) because Maestro cannot read attributes.

### Acceptance Criteria

#### An eligible student sees open and full classes for fourteen days
- **Given** a coach with open spots visible, the student on their roster and at the classes' level
- **And** a class tomorrow with 2 of 6 spots filled and a class in three days with 6 of 6 filled
- **When** the student loads `GET /api/app/academy-classes?coachId=<coach>`
- **Then** both classes are listed, the first `open` with `spotsLeft` 4 and the second `full`
- **And** no LessonInstance row was created by the read

#### Ineligible, hidden, enrolled and out-of-window classes are not listed
- **Given** the same coach, a class two levels above the student, a class whose open spots are
  turned off, a class the student is enrolled in, and a class fifteen days out
- **When** the student loads the list
- **Then** none of them is listed

#### A student not on the coach's roster is refused
- **Given** a coach the student has no roster link with
- **When** the student loads that coach's academy classes
- **Then** the response is 403

#### Requesting an open class with a note
- **Given** an open class listed for the student
- **When** they request it with the note "Posso chegar 10 min depois?"
- **Then** a pending ClassJoinRequest exists with that note
- **And** the coach's chat message and pending requests show the note
- **And** the class is listed with `myJoinRequest.status` `pending`

#### Joining a full class's waiting list
- **Given** a full class listed for the student, never materialised
- **When** they join its waiting list
- **Then** the occurrence is materialised and an active WaitingListEntry exists for them with no
  standing entry
- **And** the coach is told in the conversation
- **And** the class is listed with `onWaitingList` true
- **When** they join again
- **Then** the response is 200 and there is still exactly one entry

#### The waiting list is only for a full class
- **Given** an open class
- **When** the student tries to join its waiting list
- **Then** the response is 409 `has_spots` and no entry is written

#### Leaving the waiting list
- **Given** a student on a class's waiting list through this step
- **When** they leave it
- **Then** their entry is inactive and the class is listed with `onWaitingList` false

### Notes
- **[PAD-358, 2026-09-17]** Coordinator decisions: "eligible" is the PAD-352 open-spot eligibility
  unchanged; the window is club-local days from today; full is `effective_filled_spots ≥
  effective_max_players`; the coach's open-spots toggle gates the step (D2); the note column is
  carried by PAD-357's migration (D1). The ticket said full classes join "the existing waiting list" —
  the list existed, the student's own way onto it did not (`notifications.waiting-list` rule 1 as it
  stood, and rule 12's offer-only gate), so rule 6 and its endpoint are new.
- **[PAD-358 cross-review, Session B, 2026-09-17]** Three findings fixed before the PR, each with
  a test seen failing first: F1 the coach's class sheet shows the note (web and iOS) — rule 5
  promised it; F2 a waiting-list join tells the coach with the same pushes and a realtime event as a
  join request (rule 6); F3 the list and leave agree — every listed place can be left (rule 7),
  replacing an earlier edge where a standing-list place was listed but refused.
