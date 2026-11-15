---
id: attendance.validation
status: draft
depends_on: [attendance.presence, attendance.confirm, classes.instances]
serves: [P-ATTENDANCE-1]
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
   instances. This is a gate on the listing only (owner answer, 2026-11-10): the save route
   (`POST /class_instance/presences/confirm`) accepts any class the coach owns, ended or not,
   because the class detail's editor marks attendance on any class (rule 26).
4. **A class is "ready to confirm" when every enrolled player has answered**, i.e.
   no row has `invited=True AND confirmed=False AND status IS NULL` — the same
   "awaiting an answer" predicate the dashboard already uses. Readiness is about
   the students having answered, not about the coach having decided.
5. **Validation is blocked while any player is undecided.** A player is undecided
   when no status is stored and none is implied by rule 6.
6. **Response-based prefill.** Before the coach touches anything, a row is shown
   as: `confirmed` → present, `declined` → absent/justified, no answer →
   undecided. (PAD-313: that is the *prefilled mark*. What the row DISPLAYS as the
   student's state is rule 20's single `attendanceState`, never these columns —
   reading `confirmed` as "coming" is the defect PAD-313 fixes.) This is a display default only; nothing is persisted until the coach
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
   the missing `Presence` row, which since PAD-301 is the enrolment itself
   (`lesson_service.enrol`): `effective_filled_spots` counts it, so the calendar badge,
   the class-detail capacity field and the invitation engine all see the seat
   (`calendar.view` rule 9 forbids patching that per-surface). It does NOT enrol
   the player in the parent lesson, so they are still counted as a guest
   (rule 10).
8a. **(PAD-537; number confirmed by the owner, 2026-11-10) The walk-in picker is a search.** Adding a player to a past
    class (rule 8), on both shells and both places the validate view offers it (a class card's
    "Adicionar jogador" and the drill-in's "Entrou algum jogador à última hora?"), lists the
    players not yet in the class alphabetically while the box is empty (accents and case ignored,
    Portuguese order, by the name the coach reads) and narrows them as the coach types, with the
    app's one name rule: every typed word, in any order (`nameMatchesQuery`, PAD-516), matching
    the real name or the coach's nickname for the player. Once the coach has typed, the best
    match is listed first (`players.search` rule 6), not alphabetical order. One helper, `walkInOptions(roster, query)` in
    `@levelup/config`. Before, web showed a plain dropdown in roster order with no way to type;
    iOS had a search that matched the typed text as one substring. Test ids
    `presences-walk-in-search`, `presences-walk-in-option-<playerId>` on web.
8b. **(PAD-787, B-705) A search that offers nobody says why.** The picker offers only roster
    players not yet in the class, so "Nenhum jogador encontrado para «…»" (players.search rule 10,
    which stays) used to hide two different answers. Under that line, on web and iOS, both
    pickers:
    - when the typed name matches a player **already in this class** (same name rule, real name
      or the coach's nickname): "«nome» já está nesta aula." (the name as the coach reads it,
      PAD-683) with "Ver", which closes the search and brings that player's row into view,
      tinted for 2 s;
    - when it matches **nobody in the class either**: "Não está na tua lista de jogadores." with
      "Abrir Jogadores" (web: a link to `/players`; iOS: closes the sheet and opens the Players
      tab). The client cannot tell a student linked to another coach from a removed account
      (`/coach_players` leaves both out), so one line covers both.
    One helper decides it, `walkInEmptyReason(inClass, offeredCount, query)` in `@levelup/config`,
    over the class's players with their roster nicknames (`inClassOptions`, a twin per shell).
    Test ids: web `presences-walk-in-already`, `presences-walk-in-show`,
    `presences-walk-in-not-on-roster`, `presences-walk-in-open-players`; iOS
    `<prefix>-already-in-class`, `<prefix>-show-in-class`, `<prefix>-not-on-roster`,
    `<prefix>-open-players` (prefix `presences-card` or `presences-detail`).
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
    cutoff use Lisbon now. An aware `from`/`to` bound is converted to Lisbon time. The
    clients' presets and the Presences week are computed on the club's day too (B-060).
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
      quoted and embedded quotes doubled, named `presences-YYYY-MM-DD.csv` with the club's day
      (rule 15), not the UTC date. Identical bytes on both shells for the same state.
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
    - The stats window (the tab's period, rule 17h) and the validation week stay independent, as before.
    iOS renders the charts under its own filter sheet with the same rule (the charts are built
    from the same filtered `rows` the list shows), so the decision holds on both shells.
17b. **(PAD-814) The running period is not a finished one.** The trend's default window (the trailing
    90 days, `default_overview_range`) spans more than 31 days, so `pick_granularity` buckets it by
    month, and `_bucket_series` gap-fills up to the window's end, which is the end of the club's today.
    The running month is therefore always the series' last bucket, counted only up to today: 0 on the
    1st, a partial count later in the month. The window starts on a day 89 days back, so its first
    month is partial too. A chart must not draw the running month as if it had closed: today a
    `monotone` line falls to 0 on the 1st and reads as "activity stopped". How the payload or the
    shells mark it, and whether the student's history chart follows, is open (Open questions, PAD-814).
17c. **(PAD-837a) One column list, shared by both shells.** The players table's columns (ids,
    order, numeric or not, the unit, and which are visible by default) are one list in
    `@levelup/config` that web's table, iOS's list and columns sheet, both CSVs and the saved view
    (`settings.coach-presences-view`) all read. Today it is two copies of the same eight ids
    (`PresencePlayersTable.tsx` `COLUMNS`, `report-state.ts` `PRESENCE_COLUMNS`). The display order
    stays the list's order; the coach chooses which columns show, not where.
17d. **(PAD-837a) Every count column about time has an hours twin over the same rows.** Three
    columns gain a version measured in time: "Total de presenças" (`total`), "Faltas justificadas"
    (`justified`) and "Presenças como convidado" (`invitesJoined`). Each twin sums, over **exactly
    the presence rows its count column counts** (rule 12, rule 10), the length of each row's
    occurrence. The count columns are unchanged and stay.
    - **The length of a class is computed once in the backend.** It is the whole minutes from the
      occurrence's own `start_datetime` to its `end_datetime`, floored per class, 0 when the end is
      missing or not after the start: the same number `{duration}` renders in messages
      (`notifications.message-templates` rule 21, `_format_duration` in
      `backend/padel_app/services/message_text.py`). That integer is lifted into one helper which
      `_format_duration` then formats and the hours columns sum; there is no second duration.
    - **The server sends integer minutes** per player (`presenceMinutes`, `justifiedMinutes`,
      `guestPresenceMinutes`, `balanceMinutes`) and the shells format them; they never add durations
      themselves. The minutes come from the same filtered query as the counts
      (`_coach_presence_query`, same window, same joins), so the two row sets cannot diverge; both
      are then read only for roster players, which leaves out disabled accounts (rule 12); the sum runs in Python over the fetched rows' start and end, so it is the
      same on SQLite and Postgres (the suite runs both).
    - **Saldo de horas** (`balanceMinutes`) is computed on the server and only there: guest presence
      minutes minus justified-absence minutes (Open questions, Q2). Positive reads "recovered more
      than missed", negative "still to recover". The sign is always written (`+`, `−`, none for 0);
      a colour (green, red) may follow but never carries the meaning alone.
    - **One formatter**, in `@levelup/config`, renders minutes as hours on both shells and in both
      CSVs (Open questions, Q3). Sorting an hours column sorts by minutes, never by the text.
    - The hours columns are hidden by default; the coach adds them with the column chooser.
17e. **(PAD-837a) "Aulas como convidado" says what it counts.** It counts every presence row of
    the student on a class they are not enrolled in, present or not (rule 10): guest appearances,
    not invitations sent. The name stays (Open questions, Q1, decided); the column carries a help
    line stating its rule, and so does "Presenças como convidado" (guest and
    present). Web shows it in the column chooser and on the heading; iOS, which has no tooltips
    (rule 17), shows it in the columns sheet under the column's name.
17f. **(PAD-837b) The coach's column choice is kept on their account.** The columns a coach shows
    are saved through `settings.coach-presences-view` and come back on the next open, on web and
    on iOS alike (one account, one view). Sorting and the period are not saved (Open questions, Q5).
17g. **(PAD-837c) The tab has one period, visible at its top.** A period control (from / to, and
    shortcuts) sits at the top of the reporting surface on both shells. The statistics, every
    column, the KPI tiles and the three charts are computed for that one period: the clients send
    the same `from`/`to` to `GET /presence_stats` and `GET /presence_trend`, and both shells' query
    keys carry the bounds, so the two reads can never be for different windows. The period shown
    is the one the payload echoes (`from`/`to`), not the one the client meant to ask for. The
    shortcuts and the custom-range check are one function each in `@levelup/config`, on the
    club's day (rule 15). What the period covers beyond the reporting surface, and its default, are
    open (Open questions, Q4, Q5).
17h. **(PAD-837c) A period never counts the future and never draws an unfinished bucket as a
    finished one.** A period that runs past the club's today ("Esta semana", "Este mês") is read
    up to the end of today: the server clamps the window's end to the end of the club's today
    (23:59:59), for the statistics and the trend alike, so a justified absence declared for next
    Tuesday is not counted and the trend has no buckets after today. "Future" means after today:
    a class later today counts, as it does in today's default window. The clamp lives in the stats
    and trend services (`build_presence_stats`, `build_presence_trend`), **never** in the shared
    range parser `_presence_overview_range`, which the three `pending_validation` routes also read
    (rules 17a, 18). A period that starts after today is answered empty: every roster row at zero,
    no trend buckets, the requested bounds echoed. The running bucket is drawn as rule 17b says.
    Bounds are inclusive: a class on the first or the last day of the period counts.

18. **(PAD-190 / PAD-201, B-045; amended by PAD-539, B-342) One count for "classes to validate",
    and it is the whole backlog.** A class is *pending* when it has ended (`end_datetime <=` the
    club's now), is not canceled, and has at least one presence row that is not validated; a
    class with no presence rows has nothing to validate and is never pending (rule 1). That
    predicate is written ONCE, as a query, in `presence_overview_service` — the window listing
    (`list_pending_validation`, rule 3) and every count derive from it.
    - **The number is unbounded.** `count_pending_validation_total(coach_id, now)` counts every
      pending class of the coach with no lower bound on the date. Before PAD-539 the tab's trigger
      counted only the week it was showing (and the badge the current week, else the previous),
      so three classes left over from an earlier week read "0 aulas por validar" until the coach
      happened to navigate there — the forgetting the surface exists to prevent. A window of any
      length recreates it; history is bounded naturally because an occurrence without presence
      rows never counts. It is a count over the existing indexes (`ix_coach_in_lesson_lesson_id`,
      `uq_lesson_instance_occurrence` leading with `lesson_id`, `ix_presences_lesson_instance_id`),
      never the listing's row load.
    - **The endpoint.** `GET /class_instances/pending_validation/count?from&to` →
      `{ from, to, pendingCount, pendingTotal }`: `pendingCount` is the window's count (the week
      the tab is showing, as before — it is `len(pending)` of the listing for the same bounds, by
      construction); `pendingTotal` is the backlog. Coach-only, 403 otherwise.
    - **What the tab shows.** The trigger on both shells reads "X aulas por validar" from
      `pendingTotal`, and beneath it "Y nesta semana" from `pendingCount` for the week shown
      ("Nada nesta semana" when it is 0; on any other week the line reads "Y na semana mostrada" /
      "Nada na semana mostrada"). An empty backlog reads "Nada por validar", as before.
    - **The one number.** The coach dashboard's `validation` item (`dashboard.blocks` rule 3), the
      web sidebar badge and the iOS tab badge (rule 23) show `pendingTotal` — the same helper, so
      the three surfaces and the tab's trigger cannot disagree. The tab accepts `?week=<offset>`
      (web query string, iOS route param), any integer, as its initial week so a deep link can
      land the coach on the week it chose.

19. **(PAD-283) `validate=1` opens the validate view.** The tab also accepts `?validate=1`
    (web query string, iOS route param): the page renders with the validate dialog / sheet
    already open, on the week `?week` selects, so the dashboard's validation card
    (`dashboard.blocks` rule 10) lands the coach inside the list of classes to validate.
    Closing it leaves the coach on the tab as if they had opened it by hand.

20. **One state word per row, the same one the class sheet shows (PAD-313; number
    self-assigned, unconfirmed).** The Presences / validation rows render the single
    `attendanceState` of `attendance.presence` rule 9 through the shared helper in
    `@levelup/config` (`attendance-state`), exactly as the class-detail participant row
    does — the two surfaces computed their own answer before, which is half of why a
    cancelled student could read as "confirmed" in one place and "not attending" in
    another. The coach's *mark* controls (rule 6's prefill, the present/absent toggle)
    are unchanged: they are an action, not a second status word. No row shows two state
    words at once.
21. **A justification belongs to an absence (PAD-381, B-152).** When `POST /class_instance/presences/confirm`
    records `status: "present"`, the row's `justification` is cleared, whatever the body carries — empty,
    null, a stale value, or (what both shells and the App Store builds send) no `justification` key at
    all. The rule lives in the service (`lesson_service.add_presences`), not in the form layer: on this
    route "no justification" is expressed by ABSENCE, and the form layer leaves an absent key alone
    (PAD-367) — which is what used to keep "absent, justified" on a row the coach had corrected to
    present. It was not cosmetic: `_has_makeups` and `_unjustified_absence_count`
    (`notification_service`) counted rows by `justification` **without** checking `status`, so a corrected
    row went on counting as a justified absence (a make-up owed) or an unjustified one. Both now also
    require `status == "absent"` — **an absence is a row whose status says so** — which makes the
    engine right for the rows already stale without a data repair. The same holds for the third
    reader, `_students_with_justified_absences`, which fills the "Justified absences" group of the
    coach's manual-invitation dialog on both shells (`GET /notify/groups`, enabled by default; since
    PAD-382 it reads this coach's occurrences only — `attendance.stats` rule 1), and
    for the second writer, the attendance import (`import_service.bulk_create_presences`): a sheet
    row that says "present" is stored with no justification, whatever its justification cell holds. An ABSENT row is unchanged: a
    justification sent is written, an omitted one is left as it was. The stale rows themselves are
    not rewritten by this rule. Un-marking attendance is answered by rule 26: a row is cleared with
    `clear: true`, and `status: null` is still ignored by the route.
22. **The queue shows the state after the latest action (PAD-413, B-177).** The validation queue
    (pending and "validated this week") always shows the server's answer to the most recent refresh.
    A refresh issued earlier never replaces one issued later, whatever order their responses arrive
    in. Every write (validate, bulk validate, undo) refreshes the queue, so two quick undos issue two
    overlapping refreshes, and the first may answer last.
    - **Web:** `PresencesPage.loadQueue` numbers its requests and applies a response only if it
      belongs to the latest request. Before PAD-413 the last response to *resolve* won, and a class
      the coach had just reopened could show as validated again until the next action.
    - **iOS:** already holds by construction. The queue is a TanStack Query read, and
      `useInvalidatePresences` refreshes it with `invalidateQueries`, which cancels an in-flight
      refetch (`cancelRefetch`), so a late earlier answer is dropped.
      `apps/mobile/src/features/presences/queue-ordering.test.ts` pins that on query-core, called
      the way the hook calls it. Its control shows that a last-resolved-wins writer would have
      kept the stale queue. The screen's wiring to that query is read from the code; it is not
      driven on a simulator.

23. **(PAD-443; amended by PAD-539) Pending validations are highlighted by count, one number
    everywhere.** Validating classes is how attendance gets recorded, so the number of classes
    waiting must be hard to miss.
    - **One derivation.** `validation_badge(coach_id, now)` (backend) returns
      `{ count, weekOffset, href }`: `count` is rule 18's `pendingTotal` (the whole backlog, 0 when
      nothing is pending); `weekOffset` is the **most recent week that has something pending**
      (0 for the current week, negative for earlier ones, any distance back), derived from the
      latest pending class's start, aligned to the week start of `calendar.view` rule 5a (Sunday,
      PAD-682) against the current week; `href` is
      `/presences?validate=1` or `/presences?validate=1&week=<offset>`. Before PAD-539 it was the
      current week's count, else the previous week's, and 0 when both were clean even with older
      classes waiting. It is exposed as `GET /class_instances/pending_validation/badge` (coach-only,
      403 otherwise). The dashboard's validation item, the web sidebar's Presences badge, the iOS
      Presences tab badge and (through the same query) the iOS app icon badge all show this
      number; no client re-derives it.
    - **Tiers.** `validationTier(count)` in `@levelup/config`: `0` → `none` (no badge), `1`–`5` →
      `attention` (yellow), more than `5` → `urgent` (red). A count that is not a finite number
      is `none`, like a count of 0 or less. Both shells render the badge with the number in it, so
      the colour is never the only signal; above 99 the badge text reads `99+`.
    - **Fresh.** The badge refreshes after a validate, a bulk validate or an undo, and when the app
      regains focus.

24. **(PAD-443) Players who still need a decision stand out.** In the validate view, a player
    whose `effectiveMark` is `null` (rule 5's undecided) shows an alert icon before the name, a soft
    yellow left border on the row, and an accessible label saying they need a decision. The class
    header shows "N jogadores por decidir", the same count as `undecidedCount`. The highlight
    disappears the moment a mark is set. The alert styling never paints the state buttons, and its
    hue is distinct from the selected "Justificada" (PAD-441), so "needs a decision" and "justified"
    never read alike.
25. **(PAD-442) A class stays where the coach found it until the page is reloaded.** Which group a
    class sits in ("needs your input" or "ready to confirm") comes from the server's state only
    (`validationGroup(players)` in `@levelup/config`, i.e. `undecidedCount` with no local marks),
    never from the marks the coach has made in this visit. Marking the last undecided player keeps
    the class in "needs your input", in the same position, and its Validate button becomes available
    right there (the button follows the local marks, rule 5). Validating it removes it from the list
    as usual. Local marks are not saved, so on the next load the class is grouped by what the server
    holds; a class whose players all answered themselves still appears under "ready to confirm".
    Refreshing the queue after another write (rule 22) does not move it either, because the server's
    state for it has not changed.
28. **(PAD-441; renumbered from 26 by the owner, 2026-11-10) Each selected mark has its own colour.** `presenceMarkTone(mark)` in
    `@levelup/config` is the one mapping: `present` → `positive` (green), `justified` → `warning`
    (amber, the design system's `warning` token — the colour the class sheet already gives a justified
    absence), `unjustified` → `negative` (red). An unselected option stays neutral grey. Colour is
    never the only signal: the selected option's label is **bold** on both shells (web reserves the
    bold width in both states, so selecting never widens the button), its border takes its colour,
    and its selected state is exposed to assistive tech (`aria-pressed` on web,
    `accessibilityState.selected` on iOS). The amber of "Justificada" is a different hue from rule 24's yellow
    "needs a decision" flag, so a justified player never reads as one still to decide.

29. **(PAD-538; renumbered from 27 by the owner, 2026-11-10) Each class shows how many are present, and every row says which class it is.** Beside a class's
    time and title in the validate view — its card in the list, its row under "validated this week"
    and the drill-in's title — both shells show one number: the players whose current mark is
    present. The mark is the one the row shows (`effectiveMark`: the coach's local mark, else
    what is stored, else the prefill from "confirmed"), so the number moves as the coach marks,
    and on a validated class it is the recorded number. One helper, `presentCount(players, edits)`
    in `@levelup/config`. A single number, not "present / capacity". Zero has its own string
    ("0 presentes"), because pt's CLDR puts 0 in `one` (rule 14). Test id
    `presences-class-present-count` on both shells. Decided with the coordinator, 2026-10-07.
    **Every row also says its day and time range (PAD-924, 2026-11-15):** the card, the row under "validated
    this week" and the drill-in title read `<title> · seg 09/11 · 10:30–12:00` beside the count, the weekday in
    the app's language and the times the stored digits as they are (rule 15), so several classes with one title
    can be told apart. The payload carries `endDatetime` beside `startDatetime`, on the same wall-clock digits.
    Both lists run oldest start first. One helper, `classWhenLabel` in `@levelup/config`; test id
    `presences-class-when` on both shells.

26. **A mark can be cleared back to "no answer" (PAD-567; rule number self-assigned by Session C on
    2026-10-09, unconfirmed).** The ticket's scenario: the coach marked a student present, the
    student later says they are no longer sure, and the coach wants the row back to *"ainda sem
    resposta"* without having to call it an absence.
    - **Toggle on both shells, in both editors.** In the class detail's attendance editor
      (`AttendanceRow` on web, the presences section of `app/class/[id].tsx` on iOS) and in the
      Presences validate view (`PresenceMarkToggle` on both shells), pressing the mark that is
      already selected deselects it: the row's local mark becomes `null` (`effectiveMark`'s
      undecided, rule 5), the PAD-443 "needs a decision" highlight returns, and `presentCount` /
      `undecidedCount` move with it. The deselect is **visible** on iOS too — the control leaves
      its selected tone and the row's state word returns to "Inscrito" at once — so a cleared
      tap never reads as a dead one (orchestrator, 2026-10-09; Maestro asserts the state change). There is no separate "Limpar" control: the toggle is the
      explicit option the ticket offers as an alternative, and one gesture is less chrome.
      Test ids: web `attendance-present` / `attendance-absent` (with `aria-pressed`) and
      `attendance-save` on the class detail; iOS `attendance-present-<playerId>` and
      `attendance-confirm`; `attendance-clear-over-capacity-confirm` on both shells.
    - **Wire contract.** Saving sends the row through the existing
      `POST /class_instance/presences/confirm` as `{"playerId", "clear": true}` — an explicit
      key, never `status: null`, so an old client (which never sends a null status: rule 5 blocks
      saving an undecided row) cannot clear by accident and the falsy-dropping form layer
      (PAD-367) cannot swallow it. `add_presences` writes the **never-answered shape**, exactly
      what `enrol()` leaves: `status = None`, `justification = None`, `validated = False`,
      `response = "none"`, `responded_at = None`, `recorded_by = None`, `confirmed = False`
      (`invited` untouched). This is the one coach action that moves `response`
      (`attendance.presence` rule 7, amended): the ticket says it must work when the state came
      from the student's own answer, "exatamente como se ninguém tivesse respondido".
      The reply carries `cleared: [playerId…]` beside the rows it already returns.
    - **A validated row may be cleared** (decided here, documented for the owner): the clear
      is per row, and it sets that row's `validated = False`, so a validated class with a cleared
      row has an unvalidated presence again and comes back to "Precisa da sua decisão" (rule 18's
      backlog predicate and rule 23's badge read the rows, nothing else to do). Undo (rule 9)
      stays the per-class door and still never erases a mark.
    - **Capacity reopens.** An absent row does not occupy a seat (`effective_filled_spots`); a
      cleared one does again. Clearing an absence closes the student's own open vacancy
      (`_open_vacancy_for` → `_close_vacancy`, retiring its live invitations, PAD-499 publish on
      commit) and runs `reconcile_vacancies`, the same path `add_presences` runs for absent →
      present. **If the freed spot was taken meanwhile** — the class is at or over
      `effective_max_players` before the clear — the coach is **warned and the clear is allowed**
      (owner decision, 2026-10-09): both shells show a confirmation dialog on the class detail
      ("a aula fica acima da lotação: N/M") before saving, judged on the payload's `filled` /
      `capacity`, and the server never refuses. The validate view lists only ended classes
      (rule 3), where capacity is moot, so it needs no dialog.
    - **Reminders — the clear sends nothing (owner decision, 2026-10-10).** `notifications.reminders`
      rule 23 reads `status` at send time, so a cleared student is eligible again for any pass
      that has not fired yet, and that is all: the clear itself writes no message, sends no push
      and arms no job. When the occurrence's first-reminder instant has already passed and its
      chain is spent, the cleared student is not asked again automatically; the coach may still
      send reminders by hand. (Supersedes the PAD-567 late ask through `arm_ask_for_student`,
      which shipped in #608 and was removed before promotion.)
    - **Semi-automatic mode.** Clearing creates no vacancy and no suggestion (nothing is freed).
      When the cleared row was an absence, the class has not started and the coach is in
      semi-automatic mode, the server runs `recompute_suggestions`
      (`notifications.semi-auto-approval` rule 12) after the write,
      so a suggestion born of that absence is withdrawn and the class's suggestion state is
      re-derived; the confirm reply's `approvalBundle` reflects it.
    - **The student is not told** (owner decision, 2026-10-10): the coach is
      editing their own record, and an ordinary reminder still to run is how the student
      hears they are asked; a message saying "your answer was cleared" would be noise. The
      student's surfaces follow `attendanceState` (`planned` again) and `pendingConfirmation`
      (`attendance.confirm` rule 27) on the next read.
    - PAD-570 interplay: a cleared student is `planned`; whether they may say "Vou" is rule 27's
      predicate, not this rule's business.

27. **(PAD-591) The count endpoint counts.** `GET /class_instances/pending_validation/count`
    computes `pendingCount` and `pendingTotal` as SQL `COUNT`s over the rule 18 predicate; it never
    loads the window's rows to take their length. `pendingCount` still equals the listing's length
    for the same bounds (rule 18).

30. **(PAD-829) The validate list takes every drag, before and after a confirm.** On iOS the
    sheet's class list and a class's detail list scroll wherever the finger lands in them — on a
    class card, on a validated row's text, on a group label or in a gap between rows — and keep
    doing so after a confirm has moved classes into "validated this week". The cause was in the
    shared dialog, not the sheet: the primitive's overlay and panel were Pressables above the
    list, and on Fabric a scroll view whose ancestor is the JS responder never starts its pan
    (`RCTScrollViewComponentView._shouldDisableScrollInteraction`), so a drag that began on a
    non-pressable spot stood still; after a confirm the list is mostly such rows. The shared
    `DialogContent` therefore keeps nothing above a list that claims touches: the backdrop that
    closes on a press outside is a sibling behind the panel (`dialog-backdrop`), and the panel
    claims no touch. Every list inside a dialog is covered by the same change. The E2E fixture
    for a long list is `POST /api/app/debug/ended-classes` `{ "count": n, "weeksAgo": w }`: under
    `E2E_DEBUG_ENDPOINTS` only, with a JWT (401 without, 404 with the flag off), it gives the
    calling coach `n` ended classes (at most 30) on the day `w` weeks ago (1 to 8), every roster
    player confirmed, and answers their instance ids in start order; `DELETE` removes them.
    Web is not affected: its dialog's list is a plain `overflow-y-auto` block with no responder
    system between the finger and the scroll.

### Acceptance Criteria

#### ATTENDANCE-VALIDATION-1: The count does not load the rows (rule 27, PAD-591)
- **Given** a coach with 2 pending classes in the shown week and 40 in the backlog
- **When** the coach reads `/class_instances/pending_validation/count` under a statement recorder
  and again after 10 more pending classes are added to the week
- **Then** both requests issue the same number of statements, and `pendingCount` equals
  `len(list_pending_validation(...))` for the same bounds

#### ATTENDANCE-VALIDATION-2: The count endpoint is the listing's count
- **Given** a coach with one ready and one needs-input class in a window
- **When** they GET `/class_instances/pending_validation/count` for that window
- **Then** `pendingCount` is 2 — identical to the listing's `pendingCount` for the same bounds
- **And** a student gets 403

#### ATTENDANCE-VALIDATION-3: The tab opens on the week it was sent to
- **Given** the coach arrives at `/presences?week=-1`
- **When** the page renders
- **Then** the validate trigger counts the previous week's classes and the dialog opens on
  that week

#### ATTENDANCE-VALIDATION-4: The tab opens inside the validate view when asked (PAD-283)
- **Given** the coach arrives at `/presences?validate=1&week=-1`
- **When** the page renders
- **Then** the validate dialog (web) / sheet (iOS) is already open, listing the previous
  week's classes, without pressing the trigger

#### ATTENDANCE-VALIDATION-5: A past class with everyone answered is ready to confirm
- **Given** a class that ended yesterday where every enrolled player confirmed or declined
- **When** the coach opens the Presences tab
- **Then** the class appears under "ready to confirm" with each player prefilled per rule 6

#### ATTENDANCE-VALIDATION-6: A silent player blocks validation
- **Given** a past class where one enrolled player never answered
- **When** the coach views it
- **Then** it appears under "needs your input" and its Validate action is disabled
- **And** the unanswered player is listed first

#### ATTENDANCE-VALIDATION-7: Deciding the last player unblocks the class in place (PAD-442)
- **Given** that class
- **When** the coach marks the silent player present
- **Then** the class stays under "needs your input", in the same position, and its Validate button becomes available there
- **And** after validating it, it leaves the list

#### ATTENDANCE-VALIDATION-8: Each selected mark reads as its own colour (PAD-441)
- **Given** a class in the validate view with Ana marked present, Rui justified and Sara unjustified
- **When** the coach looks at their rows
- **Then** Ana's selected option is green, Rui's amber and Sara's red, each with a bold label and a border in its colour, and every unselected option is neutral grey with a regular-weight label
- **And** Rui's amber is not the yellow of the "needs a decision" flag

#### ATTENDANCE-VALIDATION-9: A completed class is regrouped only on the next load (PAD-442)
- **Given** a class the coach completed by marking its silent player, without validating it
- **When** the queue is refreshed by another class's validation
- **Then** the completed class is still under "needs your input"
- **And** a class whose players all answered themselves is under "ready to confirm" on every load

#### ATTENDANCE-VALIDATION-10: Validating persists attendance and finalizes the rows
- **Given** a ready class
- **When** the coach validates it
- **Then** every player's status and justification are written and `validated=True`
- **And** the class moves to the validated list
- **And** the roster statistics and charts reflect the new presences

#### ATTENDANCE-VALIDATION-11: Bulk validation skips classes that need input
- **Given** a selection of two classes, one ready and one with an unanswered player
- **When** the coach validates the selection
- **Then** only the ready class is validated
- **And** the other stays selected with an explanation naming how many were skipped

#### ATTENDANCE-VALIDATION-12: Every queued class is disabled while a bulk run is in flight (PAD-191)
- **Given** two ready classes selected for bulk validation
- **When** the coach validates the selection and the first request is still in flight
- **Then** the Validate buttons of both classes and the bulk button are disabled
- **And** once the run completes both classes are validated exactly once

#### ATTENDANCE-VALIDATION-13: Undo reopens a class without erasing it
- **Given** a validated class
- **When** the coach undoes the validation
- **Then** its rows return to `validated=False` with status and justification unchanged
- **And** the class returns to the pending list

#### ATTENDANCE-VALIDATION-14: Two quick undos leave both classes in the queue (rule 22, PAD-413)
- **Given** three classes the coach validated this week
- **When** the coach undoes two of them in quick succession, and the refresh after the first
  undo answers after the refresh after the second
- **Then** both classes are back in the queue and only the third is under "validated this
  week", and it stays that way once every response has arrived

#### ATTENDANCE-VALIDATION-15: A guest is counted as a guest
- **Given** a player with a presence on an instance but no enrolment in its parent lesson
- **When** the coach reads the roster statistics
- **Then** that player's "invites received"/"joined as guest" counts include it
- **And** an enrolled player on the same class is not counted as a guest

#### ATTENDANCE-VALIDATION-16: A coach finishes a week's validation without leaving the phone
- **Given** a past class on iOS where one enrolled player never answered and a
  walk-in attended who was never enrolled
- **When** the coach opens it from the Presences tab
- **Then** they can see each player's own answer, mark the silent one, add the
  walk-in from the roster picker, and validate the class
- **And** nothing in the flow requires the web app

#### ATTENDANCE-VALIDATION-17: A coach reads the same reporting from the phone
- **Given** a roster with presences recorded across several weeks
- **When** the coach opens the Presences tab on iOS
- **Then** they see the per-player ranking, the academy/private split and the
  presences-over-time series, drawn from the same two endpoints web uses

#### ATTENDANCE-VALIDATION-18: Narrowing the roster narrows the export
- **Given** the coach sets a minimum total and hides two columns
- **When** they export the CSV
- **Then** the file contains only the rows that survived the filters, only the
  visible columns, in the order the list is showing them
- **And** it arrives through the iOS share sheet rather than as a download

#### ATTENDANCE-VALIDATION-19: The charts follow the table filters (PAD-192)
- **Given** the coach types a name that matches one roster player
- **When** the table narrows to that row
- **Then** the ranking chart shows only that player, the academy/private split is that player's
  own, the trend is re-requested with `playerIds=<that id>`, and the chart block reads
  "Following the table filters · 1 of N players"
- **And** clearing the search restores the roster-wide charts and the caption disappears

- **Given** `GET /presence_trend?playerIds=<ana>` for a window with Ana and Bruno present
- **When** the coach reads it
- **Then** `total` counts Ana's attended classes only; without `playerIds` it counts both

#### ATTENDANCE-VALIDATION-20: A cleared filter is not a zero filter
- **Given** the coach types `0` into "max unjustified" and then clears the field
- **When** the list re-renders
- **Then** the whole roster is shown again, including players with unjustified
  absences

#### ATTENDANCE-VALIDATION-21: The player column cannot be hidden
- **Given** the column chooser
- **When** the coach tries to turn off the player column
- **Then** it stays on, on the list and in the exported CSV

#### ATTENDANCE-VALIDATION-22: A future class is never listed
- **Given** a class scheduled for next week
- **When** the coach opens the Presences tab
- **Then** it does not appear in either list

#### ATTENDANCE-VALIDATION-23: Another coach's classes are invisible
- **Given** a class owned by a different coach
- **When** this coach reads any Presences endpoint
- **Then** neither the class nor its players appear

#### ATTENDANCE-VALIDATION-24: A student cannot reach the tab
- **Given** a signed-in student
- **When** they request any Presences endpoint
- **Then** the request is rejected with 403

#### ATTENDANCE-VALIDATION-25: The Presences badge is the dashboard's number, with its tier (rule 23, PAD-443)
- **Given** a coach with 1 class this week that still has an unvalidated presence
- **When** they look at the web sidebar and the iOS tab bar
- **Then** the Presences item shows a yellow badge reading 1, the same count as the dashboard's
  validation item
- **And** with 7 such classes the badge reads 7 in red, and with none there is no badge

#### ATTENDANCE-VALIDATION-26: Validating clears the badge (rule 23, PAD-443)
- **Given** a coach whose Presences badge reads 1
- **When** they validate that class
- **Then** the badge disappears without a reload

#### ATTENDANCE-VALIDATION-27: An undecided player stands out until marked (rule 24, PAD-443)
- **Given** a class in the validate view where Rui never answered and has no stored status
- **When** the coach opens it
- **Then** Rui's row shows the alert icon and the yellow left border, and the header reads
  "1 jogador por decidir"
- **And** when the coach marks Rui "Presente", the icon and border disappear and the header no
  longer shows a count

#### ATTENDANCE-VALIDATION-28: The alert never looks like "Justificada" (rule 24, PAD-443)
- **Given** a class where Rui is undecided and Ana is marked "Justificada"
- **When** the coach views the rows
- **Then** only Rui's row carries the alert icon, and Ana's state button keeps its own colour

#### ATTENDANCE-VALIDATION-29: Correcting an absence to present clears its justification (PAD-381)
- **Given** the coach recorded Rui as absent, justified
- **When** the coach records Rui as present, with no `justification` key in the body
- **Then** the row is `present` with no justification
- **When** instead the coach records Rui as absent, unjustified
- **Then** the row is `absent`, `unjustified`
- **Given** Rui has two unjustified absences and a third row the coach corrected to present, still carrying `unjustified` from before this rule, under a bar of "at most 2 unjustified absences"
- **Then** the bar admits Rui; with three real unjustified absences it does not
- **Given** Sara's only row is `present` still carrying `justified`
- **Then** Sara is not in a "has make-ups" invitation group; with a real justified absence she is

#### ATTENDANCE-VALIDATION-30: Each class shows how many are present (rule 29, PAD-538)
- **Given** a past class with Ana (confirmed), Bruno (declined) and Carla (no answer)
- **When** the coach opens the validate view
- **Then** the class reads "1 presente" beside its time and title
- **When** the coach marks Carla present
- **Then** it reads "2 presentes"

#### ATTENDANCE-VALIDATION-31: The count is the whole backlog, not the shown week (rule 18, PAD-539)
- **Given** a coach with three pending classes in the week before last and one last week, and none in
  the current week
- **When** they open the Presences tab on the current week
- **Then** the trigger reads "4 aulas por validar" and "Nada nesta semana"; `pendingTotal` is 4 and
  `pendingCount` is 0
- **When** they move to the week before last
- **Then** the trigger still reads "4 aulas por validar" and now "3 na semana mostrada" (rule 18)

#### ATTENDANCE-VALIDATION-32: One number from three readers (rules 18 and 23, PAD-539)
- **Given** pending classes in three different weeks, one fully validated class and one class
  with no presence rows
- **When** the count endpoint, the badge endpoint and the dashboard's needs-you block are read
- **Then** `pendingTotal`, the badge's `count` and the validation item's `count` are the same
  number, equal to the number of pending classes the listing returns over all history, and the
  validated class and the empty class are not in it

#### ATTENDANCE-VALIDATION-33: The deep link lands on the most recent week with work (rule 23, PAD-539)
- **Given** the only pending classes are three weeks back
- **When** the badge is read on a Tuesday
- **Then** `count` is their number, `weekOffset` is -3 and `href` is `/presences?validate=1&week=-3`,
  and following it opens the tab on that week with the validate view open and those classes listed

#### ATTENDANCE-VALIDATION-34: The walk-in picker lists alphabetically when empty and searches when typed (rule 8a, PAD-537)
- **Given** a coach whose roster outside the class is "Zé Costa", "ana silva" and "Bruno Silva Ramos"
- **When** they open "Adicionar jogador" on a past class
- **Then** with the box empty the list reads ana silva, Bruno Silva Ramos, Zé Costa
- **When** they type "silva ana"
- **Then** only "ana silva" is listed

#### ATTENDANCE-VALIDATION-35: A student already in the class is named, not "not found" (rule 8b, PAD-787)
- **Given** a past class with "Gonçalo Simões" in it (the coach calls him "Gugu"), and a roster
  that also has "Zé Costa"
- **When** the coach types "goncalo simoes", or "Gugu", in that class's walk-in search
- **Then** "Nenhum jogador encontrado para «…»" shows with "Gonçalo Simões já está nesta aula."
  under it (web; on iOS the coach's name for him)
- **When** they press "Ver"
- **Then** the search closes and his row is brought into view (web, and iOS flow 313)

#### ATTENDANCE-VALIDATION-36: A name nobody has is not on the roster (rule 8b, PAD-787)
- **Given** the same class and roster
- **When** the coach types "Xavier"
- **Then** "Não está na tua lista de jogadores." shows with "Abrir Jogadores", which leads to the
  players list; while the search lists someone, or is blank, neither line shows

#### ATTENDANCE-VALIDATION-37: Pressing the selected mark clears it (PAD-567, rule 26)
- **Given** a coach editing attendance on the class detail with Ana marked present
- **When** they press "Presente" again
- **Then** Ana's row shows no mark, the "needs a decision" highlight returns and `presentCount` drops by one, on web and on iOS, and the same happens in the Presences validate view through `PresenceMarkToggle`

#### ATTENDANCE-VALIDATION-38: Saving a cleared row writes the never-answered shape (PAD-567, rule 26)
- **Given** Ana said no to a reminder and the coach then marked her present, so her row reads `status = "present"`, `validated = true`, `response = "declined"`, `responded_at` set, `recorded_by = "coach"`
- **When** the coach saves `{"playerId": <ana>, "clear": true}` through `POST /class_instance/presences/confirm`
- **Then** the row reads `status = null`, `justification = null`, `validated = false`, `response = "none"`, `responded_at = null`, `recorded_by = null`, `confirmed = false`, its `attendanceState` is `planned`, and the reply lists her in `cleared`

#### ATTENDANCE-VALIDATION-39: Clearing an absence reopens the seat and closes her vacancy (PAD-567, rule 26)
- **Given** Ana absent on a one-place class where she is the only student, her open vacancy inviting Bea
- **When** the coach clears Ana's mark
- **Then** `effective_filled_spots` is 1 again, Ana's vacancy is closed and Bea's invitation retired, and no new vacancy exists

#### ATTENDANCE-VALIDATION-40: The freed spot was taken: warn and allow (PAD-567, rule 26)
- **Given** Ana absent on a one-place class where Bea has since taken the seat
- **When** the coach clears Ana's mark on the class detail
- **Then** a dialog warns that the class goes to 2/1 before saving, and on confirm the server records the clear without refusing, leaving the filled count at 2

#### ATTENDANCE-VALIDATION-41: A clear after the reminder instant sends nothing (PAD-567, rule 26, owner 2026-10-10)
- **Given** a class whose first-reminder instant passed, where Ana was marked present before the pass (so rule 23 skipped her) and has no counted reminder
- **When** the coach clears her mark
- **Then** no job is armed, no message is written and she has no counted reminder — likewise when the class's notifications are off, the class is over, or the instant is ahead

#### ATTENDANCE-VALIDATION-42: A clear before the instant leaves her to the ordinary reminder (PAD-567, rule 26)
- **Given** a class whose first-reminder instant is two hours ahead and Ana marked present
- **When** the coach clears her mark and the instant then passes
- **Then** the ordinary reminder pass sends her one reminder

#### ATTENDANCE-VALIDATION-43: A cleared row brings a validated class back to the backlog (PAD-567, rule 26)
- **Given** a validated past class
- **When** the coach clears one row
- **Then** that row's `validated` is false, the class is pending again in rule 18's count and rule 23's badge, and the other rows keep their marks

#### ATTENDANCE-VALIDATION-44: A cleared absence withdraws its suggestion (PAD-567, rule 26)
- **Given** a coach in semi-automatic mode and a class that has not started, with Ana absent
- **When** the coach clears Ana's mark
- **Then** `recompute_suggestions` runs, so a suggestion born of her absence is withdrawn, and no new vacancy or suggestion is created
- **And** on a class that has already started nothing is recomputed

#### ATTENDANCE-VALIDATION-45: A class waits for validation once it has ended on the club's clock, is not canceled and has a row to validate (rules 3, 15, 18)
- **Given** classes that are running, just ended, and canceled, each with a presence that is not validated
- **When** the classes waiting for validation are counted
- **Then** a class is counted from the moment it ends on the club's clock, in summer and in winter, and not while it runs
- **And** canceling a class takes it out of the count
test: `backend/padel_app/tests/test_pad539_backlog_count.py` › `test_a_canceled_occurrence_is_never_pending` (+2 more)

#### ATTENDANCE-VALIDATION-46: The report's filters, sort and columns act on the list the coach sees (rule 17)
- **Given** the Presences report on the phone with a roster that includes a student with no activity
- **When** the coach filters, sorts and chooses columns
- **Then** with no filter every student is listed, the one with no activity included
- **And** a name, a minimum total and a maximum of unjustified absences apply together, each bound included; a blank bound, or one that is not a number, is ignored
- **And** the filter button counts the bounds in use, not the name search
- **And** the list starts sorted by total, highest first; a count column tapped for the first time sorts highest first and the name column A to Z; a second tap reverses; names sort ignoring accents
- **And** the columns keep their own order whatever order they were switched on, and every column can be shown
test: `frontend/apps/mobile/src/features/presences/report-state.test.ts` › `ignores a half-typed bound rather than blanking the list` (+15 more)

#### ATTENDANCE-VALIDATION-47: The export is a file any spreadsheet reads (rule 17)
- **Given** the Presences report with rows shown, and with none
- **When** the coach exports
- **Then** the file is named `presences-YYYY-MM-DD.csv`, the date being the club's day
- **And** every field is quoted and a quote inside a field is doubled
- **And** with no rows the file holds the header line alone
test: `frontend/apps/mobile/src/features/presences/report-state.test.ts` › `date-stamps the file so monthly exports do not collide` (+2 more)

#### ATTENDANCE-VALIDATION-48: The phone's charts are drawn from the same numbers (rules 17, 17a)
- **Given** the report's statistics, loaded, still loading, and filtered down to nobody
- **When** the phone draws its two charts
- **Then** the split is two bars, private and academy, from the totals; both stand at zero while the statistics load and when no row matches
- **And** the ranking shows the eight students with the most presences, most first, with names shortened to a first name and an initial
- **And** a student with no presence is left out of the ranking
test: `frontend/apps/mobile/src/features/presences/report-state.test.ts` › `reads the two totals the server already computed` (+10 more)

#### ATTENDANCE-VALIDATION-49: A walk-in takes a seat and is saved with the class (rule 8)
- **Given** a past class, and a roster student who was not enrolled in it
- **When** the coach adds the student and validates
- **Then** the student has a presence marked present and validated, and the class's filled count is one higher
- **And** a student who was already enrolled does not add a seat
- **And** in the app the walk-in appears in the class's list once, as a guest with no decision yet, and the server's row replaces it after the save
test: `frontend/apps/mobile/src/features/presences/validate-state.test.ts` › `appends a locally added walk-in to the class roster` (+6 more)

#### ATTENDANCE-VALIDATION-50: The roster statistics list every student, counted from their presence rows (rule 12)
- **Given** a coach's roster with students who attended private and academy classes, one with a justified absence, and one with no activity
- **When** the statistics are read for a period
- **Then** each student's total, private, academy, justified and unjustified counts are those of their rows
- **And** the student with no activity is listed with zeros
test: `backend/padel_app/tests/test_presence_overview.py` › `test_roster_player_with_no_activity_still_appears` (+1 more)

#### ATTENDANCE-VALIDATION-51: The running month is the trend's last bucket, counted up to today (rule 17b, PAD-814)
Pending Q6: this is the payload as of today, a characterisation of what rule 17b forbids the charts to draw as a finished month; how the running bucket is marked is added when the owner answers.
- **Given** a coach whose students were present in October 2026, five classes, two students each
- **When** the trend is read with the default window on 1 November 2026
- **Then** it is bucketed by month, ends today at 23:59:59, and its last bucket is November at 0 after October's 10
- **And** on 15 November, with two classes so far, November's bucket holds those 4 presences only
- **And** the window's first bucket (August) starts before the window does (4 August)
test: `backend/padel_app/tests/test_pad814_trend_running_month.py` › `test_on_the_first_the_running_month_is_a_zero_last_bucket` (+2 more)

#### ATTENDANCE-VALIDATION-52: The validate list scrolls before and after a confirm (rule 30, PAD-829)
- **Given** the iOS validate sheet on a week with ten ended, ready classes
- **When** the coach drags the list to its end and back to the top, confirms them all, and drags
  the list of validated rows to its end and back to the top
- **Then** each drag moves the list: the last class's control takes a tap at the end and the
  first class's control takes one at the top, before the confirm and after it
- **And** the shared dialog's backdrop is a sibling behind the panel, not an ancestor of it, a
  press on it closes the dialog, and the panel claims no touch
test: `frontend/apps/mobile/.maestro/flows/323-validate-sheet-scrolls-after-confirm.yaml`;
`frontend/apps/mobile/src/components/ui/dialog.test.tsx` › `[ATTENDANCE-VALIDATION-52] keeps nothing above the panel that claims touches, and the backdrop still closes`

#### ATTENDANCE-VALIDATION-54: The ended-classes fixture exists only for E2E (rule 30, PAD-829)
- **Given** a coach with a roster
- **When** they POST `/debug/ended-classes` `{ "count": 10, "weeksAgo": 1 }` under `E2E_DEBUG_ENDPOINTS`
- **Then** ten classes a week ago are listed as pending for that week, every player confirmed, and
  the answer carries their ten instance ids in start order
- **And** `DELETE /debug/ended-classes` removes them, and both answer 404 with the flag off and
  401 without a token
test: `backend/padel_app/tests/test_pad829_e2e_ended_classes.py` › `test_on_the_flag_the_coach_gets_ended_ready_classes_and_delete_removes_them` (+1 more)

#### ATTENDANCE-VALIDATION-53: Every validate row says its day and time range (rule 29, PAD-924)
- **Given** a week with three classes of the same title, validated on different days and hours
- **When** the coach opens the validate view on either shell
- **Then** each row under "validated this week" reads its title, its weekday and dd/mm, its time range and its present count, oldest start first
- **And** the pending cards and the drill-in title carry the same day and time range
- **And** the digits are the stored ones: a class at 23:30 stays on its own day, and the payload's `endDatetime` has the same wall-clock digits as `startDatetime`
test: `frontend/packages/config/src/class-when.test.ts` › `reads weekday, dd/mm and the time range in Portuguese` (+4 more)
test: `frontend/apps/web/src/components/presences/ValidateClassesDialog.test.tsx` › `validated rows read title, day, time range and present count, oldest first`
test: `frontend/apps/mobile/src/features/presences/present-count.test.ts` › `renders the shared label under the shared test id on the card, the validated row and the drill-in`
test: `backend/padel_app/tests/test_presence_overview.py` › `test_a_pending_class_carries_its_end_beside_its_start`

#### ATTENDANCE-VALIDATION-60: Each hours column sums the minutes of exactly the rows its count column counts (rule 17d, PAD-837a)
- **Given** a coach's roster with a 60-minute and a 90-minute class: one student present at both, one present at the 90-minute class as a guest, one absent justified from the 60-minute class, one absent unjustified from the 90-minute class
- **When** the statistics are read for a period holding both classes
- **Then** each student's `presenceMinutes`, `justifiedMinutes` and `guestPresenceMinutes` are the summed minutes of the rows behind `total`, `justified` and `invitesJoined` (150, 60 and 90 for the right students), and the unjustified absence adds to none of them
- **And** the same test passes on SQLite and on Postgres (CI runs the suite on both)
test: `backend/padel_app/tests/test_pad837_presence_hours.py` › `test_each_hours_column_sums_the_rows_its_count_column_counts`

#### ATTENDANCE-VALIDATION-61: A class lasts in the statistics what `{duration}` says it lasts (rule 17d, PAD-837a)
- **Given** occurrences of 60, 90 and 75 minutes, and one whose end is not after its start
- **When** the statistics count them and a message renders their `{duration}`
- **Then** each class adds to the hours columns the minutes its `{duration}` renders, and the broken one adds 0 (and renders empty)
- **And** an occurrence moved to other times counts its own times, not its series'
- **And** the minutes helper answers 0 for a missing start or end (`end_datetime` is NOT NULL in the table, so that case is the helper's alone), and the existing rule 21 tests of `{duration}` pass unchanged
test: `backend/padel_app/tests/test_pad837_presence_hours.py` › `test_a_class_counts_the_minutes_its_duration_placeholder_renders` (+ `test_the_minutes_helper_answers_zero_without_a_span`)

#### ATTENDANCE-VALIDATION-62: Saldo de horas is guest presence minus justified absence, with its sign (rule 17d, PAD-837a)
- **Given** three students: 90 guest minutes and 60 justified; 60 guest and 90 justified; 60 and 60
- **When** the statistics are read
- **Then** `balanceMinutes` is +30, −30 and 0, and an unjustified absence never moves it
- **And** both shells show "+", "−" or no sign before the formatted hours, the colour only following the sign
test: `backend/padel_app/tests/test_pad837_presence_hours.py` › `test_balance_is_guest_presence_minus_justified_absence` (+ `frontend/packages/config/src/presence-hours.test.ts` › `writes the sign before the hours`)

#### ATTENDANCE-VALIDATION-63: Hours read the same on both shells and in both files (rules 17, 17d, PAD-837a)
- **Given** a student with 90 presence minutes and another with 60
- **When** the coach shows the hours columns, sorts by one and exports
- **Then** web, iOS and both CSVs show the text the one `@levelup/config` formatter gives for those minutes (Q3), and the sort follows the minutes
- **And** each shell's test asserts its cell equals that formatter's output for the same minutes, not a literal
test: `frontend/packages/config/src/presence-hours.test.ts` › `formats minutes as hours in pt and en` (+ `frontend/apps/mobile/src/features/presences/report-state.test.ts` › `exports hours columns as the screen shows them`, `frontend/apps/web/src/components/presences/PresencePlayersTable.test.tsx` › `sorts an hours column by minutes`)

#### ATTENDANCE-VALIDATION-64: Both shells draw the table from one column list (rule 17c, PAD-837a)
- **Given** the column list in `@levelup/config`
- **When** web's table and chooser and iOS's list and columns sheet render, and either CSV is built
- **Then** each offers exactly the list's ids, in its order, with its defaults visible and `name` pinned, and neither shell declares a column list of its own
test: `frontend/packages/config/src/presence-columns.test.ts` › `lists every column once with its unit and default` (+ `frontend/apps/web/src/components/presences/PresencePlayersTable.test.tsx` › `offers the shared column list`, `frontend/apps/mobile/src/features/presences/report-state.test.ts` › `reads the shared column list`)

#### ATTENDANCE-VALIDATION-65: The guest columns explain what they count (rule 17e, PAD-837a)
- **Given** the coach opens the column chooser on web or the columns sheet on iOS
- **When** they read "Aulas como convidado" and "Presenças como convidado"
- **Then** each carries a help line stating its rule (every class of another group the student was on, whatever they answered; and those where they were present)
- **And** on web the same line is on the column's heading
- **And** the tests assert a non-empty help element per column id, never its wording
test: `frontend/apps/web/src/components/presences/PresencePlayersTable.test.tsx` › `explains the guest columns` (+ `frontend/apps/mobile/src/features/presences/PresencesColumnsSheet.test.tsx` › `explains the guest columns`)

#### ATTENDANCE-VALIDATION-66: The chosen columns come back after leaving the tab (rule 17f, PAD-837b)
- **Given** a coach who adds "Presenças (h)" and hides "Aulas privadas" on web
- **When** they leave the tab, come back, and then open the tab on iOS
- **Then** both show the same columns, in the list's order, and the CSV carries the same
test: `frontend/apps/web/src/components/presences/PresencePlayersTable.test.tsx` › `restores the saved columns` (+ `frontend/apps/mobile/src/features/presences/report-state.test.ts` › `restores the saved columns`)

#### ATTENDANCE-VALIDATION-67: Statistics and trend always read one window, and the tab shows it (rule 17g, PAD-837c)
- **Given** the coach picks 01/09/2026 to 01/10/2026
- **When** the tab loads
- **Then** both `GET /presence_stats` and `GET /presence_trend` are requested with those bounds, both query keys carry them, and the period shown at the top is the payload's `from`/`to`
- **And** picking another period refetches both, never one
test: `frontend/packages/hooks/src/presences.test.ts` › `keys stats and trend by the same period` (+ `frontend/apps/web/src/pages/PresencesPage.test.tsx` › `shows the period the server echoed`, `frontend/apps/mobile/src/features/presences/PresencesScreen.test.tsx` › `shows the period the server echoed`)

#### ATTENDANCE-VALIDATION-68: A period cuts classes at its edges, inclusively (rule 17h, PAD-837c)
- **Given** classes on 31/08, 01/09, 01/10 and 02/10 with the student present at each
- **When** the statistics and the trend are read for 01/09 to 01/10
- **Then** the classes of 01/09 and 01/10 count, in totals, hours and buckets, and the other two do not
test: `backend/padel_app/tests/test_pad837_presence_period.py` › `test_a_period_counts_its_first_and_last_day_and_nothing_outside`

#### ATTENDANCE-VALIDATION-69: A period running past today stops at today (rule 17h, PAD-837c)
- **Given** a pinned club today (the test pins the clock and passes `now=`), presences earlier in the month, a class later today, and a justified absence already declared for a day after today
- **When** the statistics and the trend are read for the whole running month
- **Then** the echoed `to` is the end of the club's today, the class later today counts, the later absence does not, and the trend has no bucket after today
- **And** a period that starts after today answers every roster row at zero, no buckets, and the requested bounds
- **And** the `pending_validation` routes answer the same with or without this change for the same `from`/`to`
test: `backend/padel_app/tests/test_pad837_presence_period.py` › `test_a_period_past_today_is_read_up_to_today` (+ `test_a_period_after_today_is_empty`, `test_the_validation_routes_are_not_clamped`)

#### ATTENDANCE-VALIDATION-70: The shortcuts mean the same days on both shells (rule 17g, PAD-837c)
- **Given** the club's today at 23:30 on a Sunday and at 00:30 on the 1st (Lisbon), in summer and winter time
- **When** each shortcut is computed
- **Then** one function in `@levelup/config` gives the bounds both shells send, on the club's day, and a custom range is checked by `isValidCustomRange`
test: `frontend/packages/config/src/presence-periods.test.ts` › `computes each shortcut on the club's day`

#### ATTENDANCE-VALIDATION-71: The validation week does not follow the period (rules 17a, 17g, PAD-837c; Q4)
Pending Q4: written to the proposal; it restates rule 17a's recorded decision, and is dropped or rewritten if the owner extends the period to the validation week.
- **Given** the period is "Mês passado" and the validation view shows this week
- **When** the coach changes either
- **Then** the other does not move, and the classes-to-validate count stays the whole backlog (rule 18)
test: `frontend/apps/web/src/pages/PresencesPage.test.tsx` › `keeps the validation week apart from the period` (+ `frontend/apps/mobile/src/features/presences/PresencesScreen.test.tsx` › `keeps the validation week apart from the period`)

#### ATTENDANCE-VALIDATION-72: Each open starts from the default period (rule 17f, PAD-837c; Q5)
Pending Q5: written to the proposal.
- **Given** the coach picked "Mês passado" and sorted by name
- **When** they leave the tab and come back
- **Then** the period is the default again and the sort is the default again, while the columns are the saved ones
test: `frontend/apps/web/src/pages/PresencesPage.test.tsx` › `opens on the default period and sort` (+ `frontend/apps/mobile/src/features/presences/PresencesScreen.test.tsx` › `opens on the default period and sort`)

### Today (PAD-837)
- The statistics are `build_presence_stats` (`backend/padel_app/services/presence_overview_service.py`),
  counted in SQL with `_count(condition)` per column: `total` = present, `justified` /
  `unjustified` = absent with that justification, `invitesReceived` = guest (no
  `Association_PlayerLesson` row) of any status, `invitesJoined` = guest and present. Pinned by
  `backend/padel_app/tests/test_presence_overview.py` (ATTENDANCE-VALIDATION-15, -50). There is no
  duration anywhere in it.
- The class length exists once, as text: `_format_duration(start, end)` in
  `backend/padel_app/services/message_text.py` (PAD-836, `notifications.message-templates` rule 21),
  whole minutes floored, empty without a positive span.
- Both routes parse `from`/`to` (`_presence_overview_range`, `frontend_api.py`) and fall back to
  `default_overview_range` (trailing 90 days to the end of the club's today). Neither clamps a
  `to` after today. `@levelup/api` `getPresenceStats` / `getPresenceTrend` accept the bounds;
  `usePresenceStats()` and `usePresenceTrend(playerIds)` never pass them, and their query keys
  (`["presence-stats"]`, `["presence-trend", ids]`) carry none.
- The columns are two copies of one list: web `PresencePlayersTable.tsx` `COLUMNS` (line 31),
  iOS `report-state.ts` `PRESENCE_COLUMNS` (line 28); defaults `name, total, private, academy,
  unjustified`; choice and sort are `useState` (web line 88-90, iOS `PresencesScreen.tsx` 100-101).
  CSVs: web `exportCsv` (`PresencePlayersTable.tsx:129`), iOS `buildPresencesCsv`
  (`report-state.ts:221`). Labels: `src/locales/{pt,en}/presences.json` `presences.column.*`
  ("Aulas como convidado" / "Guest appearances"); no column has a help line.
- The only date control on the tab is the validation week (`weekBounds`, `weekOffset`). The
  shortcuts of the student's history page are `presetRange`, written once per shell (web
  `components/attendance/dateRanges.ts`, iOS `features/attendance/date-ranges.ts`);
  `isValidCustomRange` is already in `@levelup/config` (PAD-855).
- `attendance.history` rule 4 (bucketing) needs no new text: the period filter's trend is bucketed
  by it as is. Its partial-bucket problem is rule 17b (PAD-814).

### Waves (PAD-837)
1. **837a**, ATTENDANCE-VALIDATION-61, 60, 62, 64, 63, 65: backend helper first (the minutes helper
   that `_format_duration` then calls; `message_text.py` is the messages stream's file, touched only
   with the lead's word), then `build_presence_stats` minutes and saldo, then `@levelup/config`
   column list and hours formatter, then web table/CSV and iOS list/sheet/CSV, then the locales.
   Needs Q1, Q2 and Q3 answered.
2. **837b**, after 837a (it stores the ids of 837a's shared list), SETTINGS-COACH-PRESENCES-VIEW-1
   to 5, then ATTENDANCE-VALIDATION-66: the migration (one `Coach` JSON column, parented on
   staging's head at implementation time, checked with `flask db heads`; written only on the lead's
   go, and the orchestrator is told before any push), the two routes, `@levelup/api` and a hook,
   then both shells.
3. **837c**, ATTENDANCE-VALIDATION-70, 68, 69, 67, 71, 72: `@levelup/config` periods, the server
   clamp, the hooks' keys, then the period control on both shells. Needs Q4 and Q5 answered, and
   lands after PAD-814 (rule 17b), whose running-bucket drawing it reuses.

### Open questions
PAD-837. Q1 is decided (owner, 2026-11-15); the rest are open. Each open line gives the lead's
provisional reading (or, where marked, the spec writer's) as a **proposal, not a decision**. The
criteria above are written to the proposal and change with the answer.
- **Q1, the name of "Aulas como convidado".** It counts guest appearances of any status, not
  invitations sent (rule 10; the ticket's first branch does not apply). Options: keep the name and
  add the help line (rule 17e); rename (e.g. "Aulas como convidado (todas)"). Proposal (lead): keep
  the name plus the help line; rule 10 already labels these "guest appearances, not invites".
  English already reads "Guest appearances" (`invitesReceived`) and "Attended as guest"
  (`invitesJoined`). **Decided (owner, 2026-11-15):** the name is kept and the help text is added
  (rule 17e, criterion 65); the owner may still overturn the help text's wording, so the tests
  never pin it.
- **Q2, Saldo de horas.** Proposal (lead): as the ticket proposes: guest presence hours minus
  justified-absence hours; unjustified absences stay out.
- **Q3, the hours format.** Options: "1,5 h" or "1h30". Proposal (lead): "1,5 h" with the
  Portuguese decimal comma. To pin with the answer (spec writer's proposal): English "1.5 h";
  whole hours without decimals ("1 h"); otherwise up to two decimals with trailing zeros dropped
  (75 min "1,25 h", 20 min "0,33 h"); 0 is "0 h". The CSV carries the same text as the screen
  (rule 17: the file is what the screen shows); a numeric CSV cell is the alternative.
- **Q4, what the period covers.** The ticket says "tudo o que a tab mostra". Rule 17a records a
  decision (DEC 2026-09-09, PAD-192) that the stats window and the validation week stay
  independent, so applying the period to the validation week or its count **contradicts that
  recorded decision** and needs the owner. Proposal (lead): statistics, columns, KPIs and charts
  only (ATTENDANCE-VALIDATION-71).
- **Q5, the default period and what is saved.** The ticket proposes "Este mês". Today's default is
  the trailing 90 days, chosen because one month of a small academy is too sparse for a trend
  (`default_overview_range`). Proposal (lead): keep 90 days, and do not save the period. Proposal
  (spec writer, the lead gave no reading): do not save the sort either (ATTENDANCE-VALIDATION-72).
  The ticket lists "Esta época" as "a confirmar". Proposal: offer it when the coach has a current
  season (`calendar.seasons`), as the student's history page does.
- **Column order (owner question; proposal by the spec writer).** The ticket asks for the order
  "se der". Proposal: the columns keep the list's order (rule 17c) and the saved view stores which
  columns show, not where. Reordering needs a drag control on both shells that nobody has designed,
  and saving an order nobody can change would be a stored value with no surface.
- **The ticket's screenshot of the test examples.** A deliverable of each wave, not a criterion:
  each wave's report attaches a render of its tests' examples (hours with 60 and 90 minutes, saldo
  positive, negative and zero, a period cutting classes at its edges, the view coming back).
- **The real-student check.** The ticket asks to verify the hours sums against a real student over
  a short known period. That is a check on production data, not a test, and is the lead's or the
  owner's step after the wave lands.
- **Android.** The ticket says "Web, iOS e Android". Android is the same Expo app as iOS, and
  `cortex/world/decisions/android-scoping.md` is still a draft. This spec promises web and iOS; no
  Android lane.
- **(PAD-814, owner question Q6, unanswered 2026-11-15)** How the running month is marked (rule 17b).
  Proposal, not a decision: (a) the server marks the last bucket `inProgress: true` when the window's end
  is today or later, and both shells draw that point hollow with a dashed segment from the previous one,
  dropping it while it is 0; (b) instead, each shell compares the last bucket's start with the club's
  today. Also open: whether the student's history chart (`attendance.history`, a bar chart over calendar
  presets that run past today) follows. Recommended either way: a straight (`linear`) line for counts.
  The analysis is in the stream's PAD-814 cause note.

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
