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
7a. **(PAD-191, B-033) Every class in a bulk run is guarded.** While a multi-class validation is
   in flight, the Validate action of **every** class in the run — not only the first — and the
   bulk button itself are disabled, so a coach cannot submit a queued class twice by tapping it
   mid-run. The guard is the set of in-flight class ids, not a single id. Both shells: iOS
   already disables the whole sheet with one `busy` flag; web tracks the set.
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
12b. **Both shells implement the whole flow.** Rules 5-11 — per-player marks, the
    prefill, walk-ins, bulk validation and undo — are behaviour, not web chrome,
    and iOS carries all of them (PAD-185). Only presentation differs, and only
    where the phone forces it: the walk-in picker is a searchable inline list
    rather than a dropdown (a portalled Select is invisible to iOS
    accessibility), the class list expands one class at a time, and the
    three-way mark keeps its short labels on both levels because
    "Absent – unjustified" three-across does not fit 390pt.
13. The tab lives at `/presences`, is coach-only, and appears in the sidebar. Each
    endpoint re-checks `require_coach()` server-side — the route guard is UX only
    (PAD-88 / PAD-115 precedent). `classes.detail-visibility` forbids exposing one
    student's presence data to another, so there is no student-facing counterpart.
14. All copy goes through `src/locales/{pt,en}/presences.json`. Default locale is
    `pt`. Counted strings must not be used for the empty case: Portuguese CLDR puts
    0 in the `one` category, so a count renders "0 aula".
15. Date ranges and time labels use the stored digits as they are, matching
    `attendance.history`. `start_datetime` is Lisbon wall-clock (R-023, PAD-256), and
    the clients format it without a zone conversion, so a late class never moves into
    the neighbouring week. The server's default range and the "pending validation"
    cutoff use Lisbon now. An aware `from`/`to` bound is converted to Lisbon time.
16. The players table links each row to that player's existing attendance history
    page rather than reimplementing it.
17. **Both shells carry the reporting surface too** (PAD-166): the three charts
    (per-player ranking, academy/private split, presences over time), the two
    numeric filters (minimum total, maximum unjustified), the column chooser and
    the CSV export. As with rule 12b these are behaviour, and only the
    presentation differs where the phone forces it:
    - Filtering, sorting and the CSV are computed **client-side on both shells**
      from the same roster payload — the endpoint returns one row per roster
      player, so a round trip per keystroke would be slower and worse.
    - The exported CSV is **what the screen is showing**: the visible columns in
      display order, the filtered rows in the current sort order, every field
      quoted and embedded quotes doubled, named `presences-YYYY-MM-DD.csv`.
      Identical bytes on both shells for the same state.
    - The player column is pinned and cannot be hidden, on the list or in the
      CSV — the other columns are statements about it.
    - A blank filter field is **no bound**, and `0` is a real bound. Collapsing
      the two would make clearing a field hide the whole roster.
    - iOS delivers the CSV through the **share sheet** (`UIActivityViewController`
      over a `file://` URL in the cache directory), not a download: a phone has
      no downloads folder. Web keeps its `<a download>`.
    - iOS has no Recharts and no tooltips. The charts are `react-native-svg`
      through the app's shared single-series `Chart` primitive, stacked rather
      than in a row; the academy/private donut becomes two bars of the same
      measure, and every chart carries a spoken summary because VoiceOver reads
      an SVG as one opaque image.
    - Web's toolbar controls and sortable column headings become a compact
      button row plus two sheets (filters + sort, and the column chooser), which
      commit on Apply rather than live — the list is behind the sheet.
17a. **[DEC 2026-09-09, PAD-192] The charts follow the table's filters.** On web the three
    charts and the players table share one screen and read from the same roster payload; two
    views of the same data disagreeing side by side reads as a bug, not a choice. Decided:
    the name search, minimum-total and maximum-unjustified filters are **page-level** —
    - the per-player ranking and the academy/private split re-derive from the **filtered**
      rows (client-side, like the table);
    - the presences-over-time series follows too: `GET /presence_trend` accepts an optional
      `playerIds` (comma-separated) and counts only those players' attended classes; the page
      re-requests it (debounced) whenever the filtered set changes, and requests the
      roster-wide series again when no filter is active. Sorting and the column chooser never
      affect the charts — they change how rows are shown, not which.
    - the chart block says so when narrowed ("Following the table filters · n of N players")
      so nobody reads a filtered chart as the whole roster.
    - The stats window (trailing 90 days) and the validation week stay independent, as before.
    iOS renders the charts under its own filter sheet with the same rule (the charts are built
    from the same filtered `rows` the list shows), so the decision holds on both shells.

18. **(PAD-190 / PAD-201, B-045) One count for "classes to validate".**
    `count_pending_validation(coach_id, range_start, range_end)` is the only derivation of how
    many classes in a window still have an unvalidated presence — it is `len(pending)` of
    `list_pending_validation` for the same bounds, never a second query. It is exposed as
    `GET /class_instances/pending_validation/count?from&to` → `{ from, to, pendingCount }`
    (coach-only, 403 otherwise, same `from`/`to` parsing as the listing). The tab's trigger on
    both shells reads this endpoint for the week it is showing, and the coach dashboard's
    `validation` queue item calls the same function (`dashboard.blocks` rule 3), so the two
    surfaces show one number. The tab accepts `?week=<offset>` (web query string, iOS route
    param) as its initial week so the dashboard can land the coach on the week it counted.
19. **(PAD-283) `validate=1` opens the validate view.** The tab also accepts `?validate=1`
    (web query string, iOS route param): the page renders with the validate dialog / sheet
    already open, on the week `?week` selects, so the dashboard's validation card
    (`dashboard.blocks` rule 10) lands the coach inside the list of classes to validate.
    Closing it leaves the coach on the tab as if they had opened it by hand.

### Acceptance Criteria

#### The count endpoint is the listing's count
- **Given** a coach with one ready and one needs-input class in a window
- **When** they GET `/class_instances/pending_validation/count` for that window
- **Then** `pendingCount` is 2 — identical to the listing's `pendingCount` for the same bounds
- **And** a student gets 403

#### The tab opens on the week it was sent to
- **Given** the coach arrives at `/presences?week=-1`
- **When** the page renders
- **Then** the validate trigger counts the previous week's classes and the dialog opens on
  that week

#### The tab opens inside the validate view when asked (PAD-283)
- **Given** the coach arrives at `/presences?validate=1&week=-1`
- **When** the page renders
- **Then** the validate dialog (web) / sheet (iOS) is already open, listing the previous
  week's classes, without pressing the trigger

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

#### Every queued class is disabled while a bulk run is in flight (PAD-191)
- **Given** two ready classes selected for bulk validation
- **When** the coach validates the selection and the first request is still in flight
- **Then** the Validate buttons of both classes and the bulk button are disabled
- **And** once the run completes both classes are validated exactly once

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

#### A coach finishes a week's validation without leaving the phone
- **Given** a past class on iOS where one enrolled player never answered and a
  walk-in attended who was never enrolled
- **When** the coach opens it from the Presences tab
- **Then** they can see each player's own answer, mark the silent one, add the
  walk-in from the roster picker, and validate the class
- **And** nothing in the flow requires the web app

#### A coach reads the same reporting from the phone
- **Given** a roster with presences recorded across several weeks
- **When** the coach opens the Presences tab on iOS
- **Then** they see the per-player ranking, the academy/private split and the
  presences-over-time series, drawn from the same two endpoints web uses

#### Narrowing the roster narrows the export
- **Given** the coach sets a minimum total and hides two columns
- **When** they export the CSV
- **Then** the file contains only the rows that survived the filters, only the
  visible columns, in the order the list is showing them
- **And** it arrives through the iOS share sheet rather than as a download

#### The charts follow the table filters (PAD-192)
- **Given** the coach types a name that matches one roster player
- **When** the table narrows to that row
- **Then** the ranking chart shows only that player, the academy/private split is that player's
  own, the trend is re-requested with `playerIds=<that id>`, and the chart block reads
  "Following the table filters · 1 of N players"
- **And** clearing the search restores the roster-wide charts and the caption disappears

- **Given** `GET /presence_trend?playerIds=<ana>` for a window with Ana and Bruno present
- **When** the coach reads it
- **Then** `total` counts Ana's attended classes only; without `playerIds` it counts both

#### A cleared filter is not a zero filter
- **Given** the coach types `0` into "max unjustified" and then clears the field
- **When** the list re-renders
- **Then** the whole roster is shown again, including players with unjustified
  absences

#### The player column cannot be hidden
- **Given** the column chooser
- **When** the coach tries to turn off the player column
- **Then** it stays on, on the list and in the exported CSV

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
- **[PAD-185, 2026-09-06]** The iOS validate flow now matches web: per-player status and roster
  edit before validating, walk-ins, batch select with the rule-7 skip notice, and undo/edit on an
  already-validated class. Rule 12b records the presentation differences that remain. The
  roster-diff and selection arithmetic lives in
  `apps/mobile/src/features/presences/validate-state.ts` as a pure module — the mobile vitest
  project cannot render a React Native tree, so logic left inside the component is logic no
  automated test can reach.
- **[PAD-166, 2026-09-06]** The reporting half is built; rule 17 records it. The filtering,
  sorting, column and CSV arithmetic lives in
  `apps/mobile/src/features/presences/report-state.ts`, split out for the same reason
  `validate-state.ts` was. The charts go through `apps/mobile/src/components/charts/Chart`
  (PAD-162), which already named this ticket as a consumer, and reuse PAD-162's
  `attendanceSeries` for the over-time labels rather than re-deriving them.
  **No new native module.** `expo-sharing` was considered and rejected: React Native's own
  `Share` presents the iOS share sheet for a `file://` URL, and `expo-file-system` is already
  linked into the shipped binary (`apps/mobile/src/lib/api.ts` imports it at startup), so the
  export needed no native rebuild. This mirrors the trade `app/player/[playerId].tsx` already
  records for share/clipboard.
