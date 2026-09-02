# attendance — Presence & Attendance Tracking

## attendance.presence

---
id: attendance.presence
status: implemented
depends_on: [classes.instances, players.create]
---

### Intent
Track player attendance for each class instance, including invitation, confirmation, and validation status.

### Entities
- **Presence** (`presences`): lesson_instance_id, player_id, status (present|absent|null), justification (justified|unjustified|null), invited (bool), confirmed (bool), validated (bool)
- Unique constraint: (player_id, lesson_instance_id)

### Rules
1. Presences are auto-created when an instance is materialized (invited=True, confirmed=False)
2. Players confirm attendance via reminders (confirmed=True)
3. Coach marks final attendance: status=present or status=absent
4. Absent players can be marked justified or unjustified
5. `validated=True` means the coach has finalized the attendance record

### Acceptance Criteria

#### Auto-create presences
- **Given** a class with players Alice and Bob
- **When** the instance for April 20 is materialized
- **Then** two Presence records are created with invited=True, confirmed=False, status=null

#### Mark attendance
- **Given** an instance with 4 presences
- **When** coach POSTs to `/api/app/lesson_instance/{id}/confirm_presences` with status for each player
- **Then** each presence.status is updated (present or absent)
- **And** absent players have justification set

---

## attendance.confirm

---
id: attendance.confirm
status: implemented
depends_on: [attendance.presence]
---

### Intent
Players confirm or decline their attendance in response to a reminder notification.

### Rules
1. Player responds to reminder via `POST /api/app/notify/respond_reminder`
2. Action: `yes` → confirmed=True, `no` → removes from instance
3. Confirmation updates the Presence record
4. After confirming (`yes`), a player may cancel their attendance at any time BEFORE the class start time via `POST /api/app/notify/cancel_attendance` with `{lessonInstanceId}`. Cancellation is not offered once the class has started (`now >= instance.start_datetime`)
5. Cancelling reverts the player to "not attending" and frees the spot using the exact same path as a reminder decline (`no`): it reuses the same vacancy-creation and invitation-engine logic — it does not fork a separate path. In automatic mode invitations are (re)triggered/pre-created; in semi-automatic mode the vacancy awaits coach approval before invitations are sent (see notifications.semi-auto-approval)
6. The coach configures a cancellation deadline `cancellationDeadlineHours` (default 24) on their NotificationConfig (see notifications.config). The deadline is `instance.start_datetime - cancellationDeadlineHours`. A cancellation made at or after this deadline but still before class start is **allowed** (never blocked) but flagged as a **late cancellation** (`Presence.late_cancellation=True`). A cancellation before the deadline sets `late_cancellation=False`. The spot is freed and invitations (re)triggered identically regardless of lateness
7. The `Presence.late_cancellation` boolean column records whether a cancellation was late. Serialized presence payloads expose `lateCancellation`; the serialized class-instance payload exposes the effective `cancellationDeadlineHours` (and/or a deadline timestamp) so the frontend can render deadline-aware UX
8. When a player cancels attendance (`POST /api/app/notify/cancel_attendance`), the **coach is notified** with exactly one message per cancellation. The notification reuses the existing coach↔player direct conversation / system-message infrastructure (no new channel/model): a message is created in that conversation and its push notification is directed at the coach. The message identifies the **student** (name) and the **class instance** (title + start date/time). When the cancellation is late (`late_cancellation=True`), the notification is clearly marked as a late cancellation both in its human-readable text and via a machine-readable `msg_metadata` marker (`lateCancellation: true`, plus `lessonInstanceId`). Reminder declines (`respond_reminder` with `no`) do not emit this coach cancellation notification — it is specific to the `cancel_attendance` path, which is the only path that computes lateness. The single coach notification is in addition to (and does not replace) the existing student-facing acknowledgement message
9. A student can cancel attendance directly from an enrolled class in the calendar class-detail view (not only from a chat reminder). Both surfaces (the class-detail view and the reminder bubble) call the same `POST /api/app/notify/cancel_attendance` and render deadline-aware UX from the class-instance payload's `cancellationDeadline` / `cancellationDeadlineHours`: before the deadline a normal confirm, at/after the deadline a "late cancellation" warning that still allows the cancel. The action is hidden once the class has started; a 409 is handled gracefully with an error message

#### Proactive decline (PAD-73)
10. **Proactive-decline window.** A decline made *before the student would normally have been asked to confirm* is a **proactive decline**. The window closes at the instant the attendance reminder for that instance would fire, i.e. `proactiveDeclineDeadline = _compute_reminder_dt(instance, config.get_reminder_timing())` — the **same** helper and the same `reminder_timing.firstReminder` config the scheduler uses to arm the reminder job (see `notifications.reminders`). The cutoff is therefore always derived, never a hardcoded interval, and it moves when the coach changes their reminder timing. When the timing config yields no computable instant, no proactive window exists and today's plain-cancellation behaviour applies unchanged
11. **Same endpoint, server-side classification.** A proactive decline is not a separate endpoint or a separate code path: it is `POST /api/app/notify/cancel_attendance`, which classifies the decline itself from the server clock. The response carries `{"action": "declined", "proactive": true|false}`. The client never decides which kind of decline occurred — a stale client cannot mislabel one
12. **A proactive decline is never a late cancellation.** When `now < proactiveDeclineDeadline`, `Presence.late_cancellation` is forced `False` regardless of `cancellationDeadlineHours`. This matters only when a coach configures a reminder that fires *after* their own cancellation deadline; telling the coach at the earliest moment the system ever expected an answer is by definition not late
13. **Effects of a proactive decline** (all of which reuse the existing shared decline path, `_free_spot_for_declining_player`):
    - the absence is auto-justified — `status="absent"`, `justification="justified"`, `confirmed=True`, exactly the state a reminder decline writes, so `attendance.stats` and `effective_filled_spots` stay coherent;
    - the vacancy is created **immediately** (`_ensure_vacancy_for_player`), so the spot reads as free the moment the student declines, without waiting for the next batch tick;
    - **invitation timing is unchanged**: invitations are only sent when `now >= invitationStart` (`notifications.invitations`). A decline 10 days out pre-creates the vacancy and sends nothing; the existing `invite_start_{instance_id}` job fans out at the configured hour. Semi-automatic mode still routes through coach approval
    - the coach is notified exactly once, with wording that distinguishes a proactive decline from a plain or late cancellation, and a machine-readable `msg_metadata.proactiveDecline` marker alongside the existing `cancellation` / `lateCancellation` / `lessonInstanceId` keys
14. **Authorization.** `cancel_attendance` is authorized on **enrolment**, not on the presence row: the acting user must resolve to a `Player` who has an `Association_PlayerLessonInstance` for that instance, otherwise 403. A student may only ever decline their own enrolment on a class they are actually in (PAD-88 / PAD-115 precedent)
15. **How the invitation-timing guarantee is enforced.** Declining to call `trigger_invitations` is *not* sufficient to hold invitations back: `process_invitation_batches` sweeps every `status="open"` vacancy every two minutes and fires a batch immediately on any vacancy whose `last_activity_at` is `None`. The only thing it defers to is `Vacancy.invite_not_before`. Therefore a vacancy created by a decline that lands **before** `invitationStart` is stamped with `invite_not_before = invitationStart` (the same field the semi-automatic approval path stamps, and the same field `trigger_invitations` and `_send_invitation_batch` already honour). Without this stamp a decline 10 days out would fan out invitations within two minutes, defeating rule 13. This applies to the whole shared decline path (`_free_spot_for_declining_player`), so a reminder decline outside the invitation window is held back too — which is what `notifications.invitations` already specified
16. **Frontend.** The proactive-decline affordance lives in the class-detail **participants** section, on the student's own row, and is shown only while the proactive window is open (`canDeclineProactively`). The class-instance payload exposes `proactiveDeclineDeadline` (ISO-8601 or null) and `canDeclineProactively` (bool), both computed by the same server helper as rule 10, so the button is never offered when the server would refuse it. Once the window closes the affordance disappears and the existing rule-9 cancel action remains the way to decline (a normal/late cancellation). After declining, the student's own row shows a persistent "not attending / justified absence" state **derived from their serialized presence** (`status==="absent" && justification==="justified"`), so it survives a reload. All copy goes through `src/locales/{pt,en}/calendar.json`; default locale `pt`

### Acceptance Criteria

#### Player confirms attendance
- **Given** a player with a pending reminder for instance 10
- **When** they POST to respond with action `yes`
- **Then** their presence.confirmed becomes True

#### Player declines attendance
- **Given** a player with a pending reminder for instance 10
- **When** they POST to respond with action `no`
- **Then** their presence is updated (or removed)
- **And** a vacancy may be created for the notification engine (in semi-automatic mode the vacancy awaits coach approval before invitations are sent — see notifications.semi-auto-approval)

#### Player cancels attendance after confirming (before class start)
- **Given** a player who previously confirmed attendance for instance 10 whose class has not yet started
- **When** they POST to `/api/app/notify/cancel_attendance` with `{lessonInstanceId: 10}`
- **Then** their presence is reverted to "not attending" (status=absent, justification=justified) exactly as a reminder decline
- **And** the freed spot re-triggers the existing open-spot / invitation-engine logic, identical to a reminder decline (no separate path)

#### Student cancels from the calendar class-detail view (before deadline)
- **Given** a student enrolled in a future class (its start more than `cancellationDeadlineHours` away) who opens the class in the calendar class-detail view
- **When** they use the "Cancel attendance" action shown for their enrolled class
- **Then** the app calls `POST /api/app/notify/cancel_attendance` with the instance id, their spot is freed, and their view reflects the cancellation — matching the reminder-bubble cancel behavior

#### Cancellation blocked after class start
- **Given** a player who confirmed attendance for an instance whose start_datetime is in the past
- **When** they POST to `/api/app/notify/cancel_attendance` for that instance
- **Then** the request is rejected (409) and the presence is unchanged

#### Cancellation before the deadline is not flagged late
- **Given** a coach with the default `cancellationDeadlineHours` of 24 and a player who confirmed attendance for an instance whose start is more than 24h away
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** the cancellation succeeds, `presence.late_cancellation=False`, and the freed spot re-triggers the invitation engine

#### Late cancellation is allowed but flagged
- **Given** a player who confirmed attendance for an instance whose start is less than `cancellationDeadlineHours` away but still in the future
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** the cancellation is allowed (not blocked), `presence.late_cancellation=True`, and the freed spot still re-triggers the invitation engine

#### Coach is notified on a (non-late) cancellation
- **Given** a player who confirmed attendance for an instance whose start is more than `cancellationDeadlineHours` away
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** exactly one coach-facing notification is produced in the coach↔player conversation whose push is directed at the coach
- **And** it identifies the student (name) and the class instance (title + start date/time)
- **And** it is NOT marked as a late cancellation (`msg_metadata.lateCancellation` is false)

#### Coach is notified and the late flag is set on a late cancellation
- **Given** a player who confirmed attendance for an instance whose start is less than `cancellationDeadlineHours` away but still in the future
- **When** the player cancels via `POST /api/app/notify/cancel_attendance`
- **Then** exactly one coach-facing notification is produced (no duplicate)
- **And** it is marked as a late cancellation in both its text and `msg_metadata.lateCancellation=true`

#### Proactive decline before the reminder time (PAD-73)
- **Given** a coach whose `reminder_timing.firstReminder` is `{type: "hours_before", value: 48}` and a student enrolled in an instance that starts in 10 days
- **When** the student POSTs `/api/app/notify/cancel_attendance` with that instance id
- **Then** the response is `{"action": "declined", "proactive": true}`
- **And** the presence becomes `status="absent"`, `justification="justified"`, `late_cancellation=False`
- **And** an open `Vacancy` for that instance exists immediately
- **And** no invitation message has been sent to any other student, because `invitationStart` (24h before) has not been reached

#### The window closes at the reminder time, not at a fixed interval
- **Given** the same coach and an instance that starts in 10 hours (so the 48h reminder instant has passed)
- **When** the student POSTs `/api/app/notify/cancel_attendance`
- **Then** the cancellation still succeeds but the response is `{"action": "declined", "proactive": false}`
- **And** the coach's notification is not marked as a proactive decline
- **And** raising the coach's `firstReminder` to `{type: "hours_before", value: 240}` moves the cutoff accordingly — the same 10-day-out instance is then no longer proactive

#### Class-instance payload exposes the proactive window
- **Given** a student enrolled in an instance further out than the coach's first-reminder instant
- **When** they load the class-instance detail payload
- **Then** it contains `proactiveDeclineDeadline` (the ISO-8601 reminder instant) and `canDeclineProactively: true`
- **And** for an instance inside the reminder window, `canDeclineProactively` is `false`

#### Student proactively declines from the participants section
- **Given** a student who opens a future class in the calendar class-detail view while the proactive window is open
- **When** they use the "I can't attend" action on their own row in the participants section
- **Then** `POST /api/app/notify/cancel_attendance` is called, their spot is freed, and their row shows a "not attending" state that persists across a reload

#### A non-enrolled student cannot decline someone else's class
- **Given** a signed-in student who is NOT enrolled in instance 10
- **When** they POST `/api/app/notify/cancel_attendance` with `{lessonInstanceId: 10}`
- **Then** the request is rejected with 403
- **And** no `Vacancy` is created and no invitation fan-out is triggered for that instance

#### Cancellation deadline config default and round-trip
- **Given** a coach with no explicit deadline set
- **When** they GET `/api/app/notify/config`
- **Then** `cancellationDeadlineHours` is 24
- **And** POSTing a new value persists and is returned on the next GET

---

## attendance.stats

---
id: attendance.stats
status: implemented
depends_on: [attendance.presence]
---

### Intent
Calculate attendance statistics for players, used by the notification engine for ranking and restrictions.

### Rules
1. `_attendance_stats(player_id)` returns (attendance_rate, justified_miss_rate)
2. `_unjustified_absence_count(player_id, coach_id)` counts unjustified absences
3. `_has_makeups(player_id, coach_id)` returns True if justified absences > accepted invitations
4. These stats feed into notification engine tiebreaker sorting and restriction checks

---

## attendance.history

---
id: attendance.history
status: implemented
depends_on: [attendance.presence, classes.instances, players.list, dashboard.navigation]
---

### Intent
Give a student a visual, navigable history of the classes they actually attended, and give a
coach the same view for any player on their own roster. The page shows **attendance only** — it
never contrasts present against absent on a single surface.

**(PAD-141)** This spec previously added "and it is not a 'missed classes' page". That was a
statement about what did not exist yet, not a design constraint: `attendance.absences` is now
the missed-classes counterpart. The surviving constraint is the one that always mattered — each
page charts **one** predicate, so neither page is a present-vs-absent comparison view.

### Entities
No new entity. The history is derived from existing `presences` joined to `lesson_instances`;
`presences` has no date column of its own, so `LessonInstance.start_datetime` is the timestamp
for every bucket and every history row.

### Rules
1. `GET /api/app/attendance_history` returns a player's attendance history.
   Query params: `playerId` (optional), `from` / `to` (ISO-8601, optional), `granularity`
   (optional: `day` | `month` | `year`).
2. **Attendance predicate**: a class counts as attended when its `Presence.status == "present"`.
   This is the same predicate as `compute_player_kpis().lessons_attended`, so the page and the
   dashboard "Attended" KPI can never disagree. Absences, declines, pending invitations and
   cancellations are excluded and are never rendered.
3. **Authorization is enforced on the endpoint, not on the frontend route** (PAD-88 / PAD-115
   precedent). Resolution order:
   - a caller who is a player and requests their own `playerId` (or omits it) is allowed;
   - otherwise, a caller who is a coach must have an `Association_CoachPlayer` row for the
     requested player — enforced with `require_own_roster_relation`, 403 when absent;
   - any other caller is 403.
   The self case is resolved **before** the coach case so a user holding both profiles is never
   403'd on their own data.
4. **Bucketing** is computed from `LessonInstance.start_datetime` in UTC. The server chooses the
   granularity when the client does not pin one, and **always echoes the granularity it used**
   in the response, so the frontend labels axes from the payload instead of re-deriving it:
   - span ≤ 31 days → `day`
   - span ≤ 18 months → `month`
   - longer → `year`
5. The response contains a **contiguous, gap-filled** bucket series covering the whole requested
   range (empty buckets are present with `count: 0`), so the chart's x-axis is continuous rather
   than skipping periods with no attendance.
6. The default range when no `from`/`to` is supplied is the current month.
7. The response also contains a `sessions[]` list of the attended classes in range, most recent
   first, each carrying the class title, its `startDatetime`, its `lessonInstanceId`, and an
   `href` deep link.
8. **The session `href` is the calendar deep link mandated by `dashboard.navigation` rule 8**:
   `/calendar?classId=lessoninstance-<id>&date=<YYYY-MM-DD>`. An attended class is always a
   materialized instance, so it is always the `lessoninstance-<id>` form, never the virtual
   `lesson-<id>-<date>` form. Clicking a history row opens the calendar on that class's week
   with its detail sheet already open — identical to clicking a dashboard class-list row.

### Frontend rules
9. Two routes, one page:
   - `/attendance` — the signed-in student's own history (player role).
   - `/players/:playerId/attendance` — a coach viewing one roster player's history (coach role).
   The coach variant identifies whose history is shown and offers a way back to that player's
   profile. Both routes render the same component; the data source is the single endpoint in
   rule 1, which re-authorizes server-side.
10. Range controls sit **below** the chart: `1W`, `1M`, `1Y`, and `…`.
    - `1W` = the current week, bucketed into its 7 days
    - `1M` = the current month, bucketed by day
    - `1Y` = the current year, bucketed into its 12 months
11. `…` reveals "from" / "to" date fields for a custom period. Granularity is not asked for — it
    follows rule 4 from the chosen span.
12. While a custom period is active, a `Clear` control is shown. Clearing removes the custom
    period and returns to the default preset view, from which a new custom period may be set.
13. Below the chart, the attended-class history lists each class with its day. Each row is
    keyboard reachable (exposed as a button, activates with Enter/Space) and navigates to the
    `href` from rule 8.
14. All user-facing copy goes through the i18n system (`src/locales/{pt,en}/attendance.json`).
    No hardcoded strings; default locale is `pt`.

### Acceptance Criteria

#### Student sees their own attendance history
- **Given** a signed-in student with attended classes in the current month
- **When** they open `/attendance`
- **Then** the attendance chart renders, the range controls `1W` / `1M` / `1Y` / `…` are shown
  below it, and the attended classes are listed underneath with their dates

#### Range presets re-query and re-bucket
- **Given** a student on `/attendance`
- **When** they select `1Y`
- **Then** the request covers the current year and the response granularity is `month`
- **And** when they select `1W`, the request covers the current week and the granularity is `day`

#### Custom period and Clear
- **Given** a student on `/attendance`
- **When** they open `…` and set a "from" and "to" date
- **Then** the chart re-renders for that period with a granularity derived from its span
- **And** a `Clear` control appears; activating it drops the custom period and restores the
  preset view

#### Coach opens a roster player's attendance
- **Given** a coach viewing the profile of a player on their roster
- **When** they follow the attendance link
- **Then** they land on `/players/:playerId/attendance` and see that player's attendance history

#### A coach cannot read a non-roster player's attendance
- **Given** a coach with no `Association_CoachPlayer` row for player X
- **When** they `GET /api/app/attendance_history?playerId=X`
- **Then** the request is rejected with 403 and no attendance data is returned

#### A student cannot read another student's attendance
- **Given** a signed-in student
- **When** they `GET /api/app/attendance_history?playerId=<another player's id>`
- **Then** the request is rejected with 403

#### History row opens that exact class
- **Given** a student on `/attendance` with at least one attended class
- **When** they click that class in the history list
- **Then** they land on `/calendar` showing that class's week with its detail sheet open

#### Only attendance is shown
- **Given** a student with both attended and missed classes
- **When** they open `/attendance`
- **Then** only the attended classes are counted and listed; missed classes never appear

### Notes
- Source: ticket PAD-114.

## attendance.absences

---
id: attendance.absences
status: draft
depends_on: [attendance.presence, attendance.history, classes.instances, players.list, dashboard.navigation]
---

### Intent
Give a student a visual, navigable history of the classes they **missed**, and give a coach the
same view for any player on their own roster. It is the counterpart of `attendance.history`:
same shape, same controls, same navigation contract — the predicate is what differs.

Before PAD-141 the student dashboard carried a "Missed" KPI with a number and no destination,
so the one surface that told a student they had absences was also the one that could not explain
them.

### Entities
No new entity, and **no migration**. Derived from existing `presences` joined to
`lesson_instances`, exactly as `attendance.history` is.

### Rules
1. `GET /api/app/absence_history` returns a player's absence history. Query params are identical
   to `attendance.history` rule 1: `playerId` (optional), `from` / `to` (optional),
   `granularity` (optional).
2. **Absence predicate**: a class counts as missed when its `Presence.status == "absent"`.
   This is the same predicate as `compute_player_kpis().lessons_missed`, so the page and the
   dashboard "Missed" KPI can never disagree — the same guarantee rule 2 of `attendance.history`
   makes for "Attended".
3. **Justified and unjustified absences both count.** `lessons_missed` does not filter on
   `justification`, so neither may this page: a page that showed only unjustified absences would
   display a smaller number than the KPI that links to it. The justification IS surfaced per row
   (rule 8) so the distinction is visible without changing the total.
4. Authorization, bucketing, gap-filling, the default range and the `sessions[]` contract are
   **identical to `attendance.history` rules 3–8** and are implemented by the same shared code
   path, not a parallel one. In particular the endpoint re-authorizes the subject with the same
   resolver, self before coach.
5. A missed class is always a materialized instance (a `Presence` row exists), so the session
   `href` is always the `lessoninstance-<id>` deep-link form of `dashboard.navigation` rule 8.

### Frontend rules
6. Two routes, one page, mirroring `attendance.history` rule 9:
   - `/absences` — the signed-in student's own absences
   - `/players/:playerId/absences` — a coach viewing one roster player
7. The page reuses the `attendance.history` chart, range-control and list components rather than
   duplicating them. It carries its own `absences-*` test ids, so neither page's assertions can
   pass against the other page.
8. Each row shows whether that absence was **justified** or **unjustified**, from
   `Presence.justification`. This is the one visible addition over the attendance list, and it is
   presentational only — it never filters the set (rule 3).
9. All copy goes through i18n (`src/locales/{pt,en}/`), default locale `pt`. The feature is named
   "Faltas" in Portuguese.

### Acceptance Criteria

#### Student sees their own absence history
- **Given** a signed-in student with missed classes in the selected range
- **When** they open `/absences`
- **Then** the chart renders with a non-zero bar for each period containing an absence, the
  range controls are shown, and the missed classes are listed most-recent-first

#### The Missed KPI is the entry point
- **Given** an authenticated student on the dashboard
- **When** they click the "Missed" KPI card
- **Then** they navigate to `/absences`

#### The page total matches the dashboard KPI
- **Given** a student with both justified and unjustified absences
- **When** they open `/absences` over a range covering all of them
- **Then** every absence is counted regardless of justification, and the total agrees with the
  dashboard "Missed" KPI

#### Justification is visible per row
- **Given** a student with one justified and one unjustified absence
- **When** they open `/absences`
- **Then** each row indicates which it is, and both rows are present

#### Only absences are shown
- **Given** a student with both attended and missed classes
- **When** they open `/absences`
- **Then** only the missed classes are counted and listed; attended classes never appear

#### A coach cannot read a non-roster player's absences
- **Given** a coach with no `Association_CoachPlayer` row for player X
- **When** they `GET /api/app/absence_history?playerId=X`
- **Then** the request is rejected with 403 and no data is returned

#### A student cannot read another student's absences
- **Given** a signed-in student
- **When** they `GET /api/app/absence_history?playerId=<another player's id>`
- **Then** the request is rejected with 403

#### Absence row opens that exact class
- **Given** a student on `/absences` with at least one missed class
- **When** they click that class in the list
- **Then** they land on `/calendar` showing that class's week with its detail sheet open

### Notes
- Source: ticket PAD-141.
- Supersedes `dashboard.navigation`'s previous "Missed stays inert" rule (now 11a).

---

## attendance.validation

---
id: attendance.validation
status: draft
depends_on: [attendance.presence, attendance.confirm, classes.instances]
---

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
