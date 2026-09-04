---
id: attendance.validation
status: draft
depends_on: [attendance.presence, attendance.confirm, classes.instances]
implements: ../../specs-business/attendance/coach-finalizes-attendance-records.business.md
governed_by: []
---

# attendance.validation


### Intent
Give a coach one place to finalize attendance for classes that have already run,
instead of opening each class's detail sheet one at a time. This is the
specification for the `validated` flag that `attendance.presence` rule 5 reserves
but never elaborates.

### Entities
No new entities. Reads and writes `Presence` (`attendance.presence`) only.

### Rules
1. **Validation is per presence row, derived per class.** A class counts as
   validated when every one of its `Presence` rows has `validated=True`. There is
   no class-level validated column — `calendar.view` rule 11 guarantees a class's
   `completed` status is derived from the clock and is never coach-settable, and a
   second, coach-settable "this class is done" flag would contradict it.
2. **Recording attendance *is* validating.** `POST /class_instance/presences/confirm`
   already stamps `validated=True` on every row it writes (`add_presences`). The
   validation surface introduces no separate "validate" write.
3. **Only classes that have already ended are listed.** `end_datetime <= now`.
   Canceled instances are excluded. Validating a future class is meaningless, and
   `attendance.confirm`'s vacancy/invitation side-effects only run for future
   instances.
4. **A class is "ready to confirm" when every enrolled player has answered**, i.e.
   no row has `invited=True AND confirmed=False AND status IS NULL` — the same
   "awaiting an answer" predicate the dashboard already uses. Readiness is about
   the students having answered, not about the coach having decided.
5. **Validation is blocked while any player is undecided.** A player is undecided
   when no status is stored and none is implied by rule 6.
6. **Response-based prefill.** Before the coach touches anything, a row is shown
   as: `confirmed` → present, `declined` → absent/justified, no answer →
   undecided. This is a display default only; nothing is persisted until the coach
   validates. Defaulting a self-declared absence to *justified* is a deliberate
   policy choice — `unjustified_absences` feeds the eligibility bar
   (`eligibility.rules` rule 3), so the generous reading is the safe one, and the
   coach can always downgrade it.
7. **Bulk validation never force-approves.** Validating a multi-class selection
   confirms only the classes that satisfy rule 4; the rest are returned to the
   selection with an explanation and must be reviewed individually.
8. **A walk-in can be added to a past class**, and is marked present. This creates
   both the missing `Presence` row **and** the `Association_PlayerLessonInstance`
   row — `effective_filled_spots` counts instance associations, not presences, so
   a presence-only walk-in would occupy a spot that the calendar badge, the
   class-detail capacity field and the invitation engine all fail to see
   (`calendar.view` rule 9 forbids patching that per-surface). It does NOT enrol
   the player in the parent lesson, so they are still counted as a guest
   (rule 10).
9. **Validation does not lock the record.** A validated class can be reopened
   (`validated=False` on its rows) and re-validated. Status and justification
   survive a reopen — undo makes the record editable again, it does not erase it.
   No lock is introduced: `eligibility.rules` rule 8 evaluates presence-derived
   stats fresh and never snapshotted, and `attendance.confirm`'s decline paths
   have no "class already ended" guard, so a lock would silently break them.
10. **Guest attendance is enrolment-derived, never `invited`-derived.**
    `Presence.invited` is set for every enrolled player at materialization
    (`classes.instances` rule 1), so it identifies nobody. A guest is a player
    with a presence on an instance but no `Association_PlayerLesson` row for its
    parent lesson. This is the same set `classes.instance-enrollment` rule 2
    calls "one-off additions" — substitutes and invitation acceptances alike —
    so the columns are labelled "guest appearances", not "invites": a coach
    adding a substitute by hand never sent an invitation.
11. **A player's stored `status` is not reported back as their own answer once the
    coach has validated the row.** A coach marking someone absent writes the same
    columns a student decline does; only the coach's path also sets
    `validated=True`. A validated row therefore reports "no answer" rather than
    attributing a claim to the student.
12. **Roster statistics cover every roster player**, including those with no
    activity in the window — a zero row is the signal a coach needs. "Attended" is
    `status == "present"`, pinned to `compute_player_kpis().lessons_attended` so
    this surface can never disagree with the dashboard or `attendance.history`.

### Frontend rules
13. The tab lives at `/presences`, is coach-only, and appears in the sidebar. Each
    endpoint re-checks `require_coach()` server-side — the route guard is UX only
    (PAD-88 / PAD-115 precedent). `classes.detail-visibility` forbids exposing one
    student's presence data to another, so there is no student-facing counterpart.
14. All copy goes through `src/locales/{pt,en}/presences.json`. Default locale is
    `pt`. Counted strings must not be used for the empty case: Portuguese CLDR puts
    0 in the `one` category, so a count renders "0 aula".
15. Date ranges and time labels are computed and formatted in **UTC**, matching
    `attendance.history` — `start_datetime` is naive UTC, and a local-time week
    boundary would move a late class into the neighbouring week.
16. The players table links each row to that player's existing attendance history
    page rather than reimplementing it.

### Acceptance Criteria

#### A past class with everyone answered is ready to confirm
- **Given** a class that ended yesterday where every enrolled player confirmed or declined
- **When** the coach opens the Presences tab
- **Then** the class appears under "ready to confirm" with each player prefilled per rule 6

#### A silent player blocks validation
- **Given** a past class where one enrolled player never answered
- **When** the coach views it
- **Then** it appears under "needs your input" and its Validate action is disabled
- **And** the unanswered player is listed first

#### Deciding the last player unblocks the class
- **Given** that class
- **When** the coach marks the silent player present
- **Then** the class moves to "ready to confirm" and Validate becomes available

#### Validating persists attendance and finalizes the rows
- **Given** a ready class
- **When** the coach validates it
- **Then** every player's status and justification are written and `validated=True`
- **And** the class moves to the validated list
- **And** the roster statistics and charts reflect the new presences

#### Bulk validation skips classes that need input
- **Given** a selection of two classes, one ready and one with an unanswered player
- **When** the coach validates the selection
- **Then** only the ready class is validated
- **And** the other stays selected with an explanation naming how many were skipped

#### Undo reopens a class without erasing it
- **Given** a validated class
- **When** the coach undoes the validation
- **Then** its rows return to `validated=False` with status and justification unchanged
- **And** the class returns to the pending list

#### A guest is counted as a guest
- **Given** a player with a presence on an instance but no enrolment in its parent lesson
- **When** the coach reads the roster statistics
- **Then** that player's "invites received"/"joined as guest" counts include it
- **And** an enrolled player on the same class is not counted as a guest

#### A future class is never listed
- **Given** a class scheduled for next week
- **When** the coach opens the Presences tab
- **Then** it does not appear in either list

#### Another coach's classes are invisible
- **Given** a class owned by a different coach
- **When** this coach reads any Presences endpoint
- **Then** neither the class nor its players appear

#### A student cannot reach the tab
- **Given** a signed-in student
- **When** they request any Presences endpoint
- **Then** the request is rejected with 403

### Notes
- Source: ticket PAD-140.
- Fills in the `validated` field reserved by `attendance.presence` rule 5, which
  had no rules or acceptance criteria of its own.
- **[DEC 2026-09-04, PAD-166]** PAD-140 ported the Presences tab to iOS as a subset (this spec's
  rules 1-16, the validate flow, is PAD-185 and needs no decision). The remaining gap — the three
  charts (attendance-over-time, per-player, academy/private split), CSV export, table filters,
  the column chooser, and the academy/private breakdown — was an open product question (is
  presence *analysis* phone work at all). Decided: **build it.** PAD-166 becomes a real build
  ticket (wave 3): charts via `react-native-svg` (not Recharts, which is web-only), CSV export via
  the iOS share sheet rather than a browser download. Not yet built as of this decision.
