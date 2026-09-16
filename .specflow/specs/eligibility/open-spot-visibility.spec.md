---
id: eligibility.open-spot-visibility
status: implemented
depends_on: [eligibility.cascade, calendar.view]
implements: ../../specs-business/eligibility/student-discovers-open-spots.business.md
governed_by: []
---

# eligibility.open-spot-visibility


### Intent
Students discover classes they could join **inside the calendar they already have** — not through a
separate browse screen. A coach controls whether their open spots are advertised at all.

### Entities
- **NotificationConfig**, **Lesson** and **LessonInstance** each gain
  **`open_spots_visible`** (boolean, nullable) — the coach standard and its two override tiers.

### Rules
1. A student's calendar shows, in addition to the classes they are enrolled in, any **future** class
   that is **visible** (rule 3), has an **empty spot** (rule 4), and for which the student is
   **eligible** (`eligibility.cascade`).
2. Open-spot classes render in a **distinct colour** from the student's own enrolled classes, so the
   two are never confused. They are visibly "available", not "yours".
3. **Visibility is a coach toggle that cascades exactly like eligibility** — coach standard,
   overridable per recurring group and per single class, most specific wins, tiers do not merge
   (`eligibility.cascade` rules 1–3). Coach-facing label: "make empty spots for future classes
   visible to eligible students (they can request to join)".
4. **"Has an empty spot" is the class's existing capacity measure**, not a new one:
   `effective_filled_spots < max_players` (`calendar.view` rules 8–9). For a **non-materialized**
   recurrence occurrence there are no presences, so it is the enrolment count against `max_players`
   (`calendar.view` rule 10). Both cases must be handled — future recurring occurrences are most of
   a student's forward calendar.
5. Visibility is computed at read time from the current state. No row is created, and no class is
   materialized, merely because a student looked at their calendar.
6. Only classes taught by a coach the student is on the roster of are ever shown. This feature never
   exposes classes from a coach the student has no relationship with.
7. Classes that have started (judged on the club's clock, PAD-256) and classes with status `canceled` or `completed` are never shown as open spots.
8. A student's own availability blocker (`calendar.student-blockers`) suppresses *solicitations*, not
   *discovery*: a blocked window still shows open spots. The student initiates here, so the
   protection the blocker exists to give is not at stake.
9. With the toggle off — at whichever tier resolves — the student's calendar is exactly what it is
   today: their enrolled classes only.
10. **(PAD-130) Wire contract.** `open_spots_visible` is a tri-state at the lesson and instance
    tiers (`NULL` = inherit, `true`/`false` = override) and a boolean at the coach tier (default
    off), resolved by `effective_open_spots_visible()` — the same instance → lesson → coach walk
    as `eligibility.cascade` rule 1. The coach tier is `openSpotsVisible` on the notification
    config; a class edit sends `updates.openSpotsVisible` (absent = untouched, `null` = inherit,
    boolean = override) and the class payload carries `openSpotsVisible`,
    `effectiveOpenSpotsVisible` and `openSpotsSource`. A student's `GET /calendar` appends the
    discoverable classes to their own events, each flagged `openSpot: true` and carrying
    `coachName`; an event without the flag is one of theirs. Discovery reuses the calendar's own
    loaders and `serialize_calendar_event` — no second projection of occurrences.
11. **(PAD-130) Both shells render the flag, not a colour of their own choosing:** an open-spot
    card keeps the class's colour as an outline on a plain surface with a dashed edge and an
    "Open spot" chip, so it reads as an offer beside the filled cards that are the student's
    own. Tapping it opens the same class detail the student already has (their own data only,
    `classes.detail-visibility`), where `classes.join-requests` adds the request action.
12. **(PAD-352) Only a client that says it understands open spots is sent them. It fails
    closed.**
    - **The declaration:** a request declares its capabilities in the `X-LevApp-Capabilities`
      header, a comma-separated list of tokens (case-insensitive, surrounding whitespace ignored).
    - **The gate:** rule 10's open-spot events are appended to a student's calendar only when that
      list contains `open-spots`. With no header, or without that token, the calendar is exactly
      rule 9's (the student's enrolled classes only) whatever the coach's toggle says. The same
      declaration gates the open-spot read exception in `classes.detail-visibility` rule 5.
    - **Why:** the App Store builds live since August, 1.0 (`6f5d0c1ce`) and 1.1.0 (`6b48f79e3`),
      predate rule 10's flag. They send only `Authorization` and draw every calendar event as the
      student's own class, so to them an open spot looks like a booking that doesn't exist.
    - **Who declares:** each shell passes its capabilities to the shared API client explicitly.
      Web and mobile both render the flag (rule 11), so both declare `open-spots`. The client's
      default is none, so a shell never inherits a promise it can't keep. The next App Store build
      (PAD-351) declares it because it is built from the mobile source.
    - **Retirement:** once no App Store build that predates the declaration is still in use, serve
      open spots regardless of the header and delete this rule and its check. The header itself
      stays for later capabilities.

### Acceptance Criteria

#### An eligible student sees an open spot in a visible class
- **Given** a coach with the visibility toggle on and eligibility `[{level, same_as_class}]`
- **And** a future class at the student's level with 5 of 6 spots filled
- **When** the student loads their calendar
- **Then** that class appears, visually distinct from their enrolled classes
- **And** it is marked as having an open spot

#### An ineligible student sees nothing
- **Given** the same class and a student two levels below it
- **When** they load their calendar
- **Then** the class does not appear

#### A full class is not advertised
- **Given** a visible class at the student's level with all 6 spots filled
- **When** the student loads their calendar
- **Then** the class does not appear

#### A future recurring occurrence with room is advertised
- **Given** a visible recurring class that has never been materialized for next Tuesday, with 4
  enrolled players and `max_players` 6
- **When** an eligible student loads a calendar range covering next Tuesday
- **Then** the occurrence appears as an open spot
- **And** no LessonInstance row is created by the read

#### A single class can be hidden inside a visible series
- **Given** a recurring class with visibility on, and one occurrence overridden to off
- **When** an eligible student loads a range covering that occurrence
- **Then** that occurrence does not appear, and the other occurrences still do

#### The toggle off restores today's behaviour
- **Given** a coach with the visibility toggle off
- **When** any student of theirs loads their calendar
- **Then** only the classes that student is enrolled in appear

#### Open spots need both the coach's toggle and the client's declaration (PAD-352)
- **Given** a future class at an eligible student's level with 5 of 6 spots filled, the student not
  enrolled in it, and its coach's visibility toggle either on or off
- **When** the student loads a calendar range covering it, once with
  `X-LevApp-Capabilities: open-spots` and once with no `X-LevApp-Capabilities` header
- **Then** the class appears, flagged `openSpot: true`, only when the toggle is on **and** the header
  declares `open-spots`
- **And** in the other three cases the calendar holds exactly the student's enrolled classes, and no
  event carries `openSpot`

#### An old client cannot take an attendance action on an open spot (PAD-352)
- **Given** that advertised class and the same student, not enrolled in it
- **When** they send `POST /api/app/notify/cancel_attendance` for it, which is the only attendance
  action the student's class screen offers in App Store 1.0 and 1.1.0 (and it is shown only for a
  class they have a presence row in)
- **Then** the server answers 403 and writes no Presence row

### Notes
- **[PAD-130, 2026-09-09]** Rules 10–11 record the wire contract and the card. Stacked on PAD-129:
  the visibility cascade reuses the tier walk and the class-sheet block that PAD-129 introduced.
- **[PAD-352, 2026-09-15]** Rule 12 is a compatibility rule. It exists only because App Store
  1.0/1.1.0 can't be changed, and the rule itself says when to retire it. The marker
  (`X-LevApp-Capabilities: open-spots`) is the one PAD-351's next App Store build must send. The
  surfaces were found by tracing every use of the open-spot machinery: the calendar append (rule 10)
  and the class-detail read exception (`classes.detail-visibility` rule 5). The dashboard, push and
  SSE carry no open-spot events.
