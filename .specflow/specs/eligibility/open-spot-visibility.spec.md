---
id: eligibility.open-spot-visibility
status: draft
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
7. Past classes and classes with status `canceled` or `completed` are never shown as open spots.
8. A student's own availability blocker (`calendar.student-blockers`) suppresses *solicitations*, not
   *discovery*: a blocked window still shows open spots. The student initiates here, so the
   protection the blocker exists to give is not at stake.
9. With the toggle off — at whichever tier resolves — the student's calendar is exactly what it is
   today: their enrolled classes only.

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
