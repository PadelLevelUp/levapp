---
id: attendance.history
status: implemented
depends_on: [attendance.presence, classes.instances, players.list, dashboard.navigation]
serves: [P-ATTENDANCE-3]
governed_by: []
---

# attendance.history


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
6. The default range when no `from`/`to` is supplied is the current month on the club's clock (PAD-256).
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
10. Range controls sit **below** the chart: `1W`, `1M`, `1Y`, and `…`. The presets are computed on
    the club's day (`Europe/Lisbon`), whatever the device's zone (B-060).
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

### Mobile (PAD-162)

15. **iOS ships the same surface.** PAD-114 shipped web-only and no PR recorded a decision to
    do that; PAD-162 closes it. `apps/mobile/app/attendance.tsx` is the single screen behind
    both entry points, and rules 10–14 hold on it unchanged.
16. Expo Router has no `/players/:playerId/attendance` path, so the coach variant is the same
    screen with a query param: `/attendance?playerId=<id>`. This is a routing shape only — the
    param is still not authorization, and rule 3 is still the whole of it.
17. Entry points mirror web's:
    - the student's dashboard "Attended" KPI tile (`href: "/attendance"` from the backend, now
      mapped to a mobile route in `DashboardBlocks`);
    - an action on the coach's player-detail screen (`player-attendance-link`), first in the
      action row, as it is first in web's `PageActions`.
18. A history row deep-links to `/class/[id]` rather than following the server-built `href`
    from rule 8: `/calendar?classId=…` is not a route in the Expo Router tree. The row resolves
    the same `calendarEventId` through `parseDashboardItemId`, which is exactly what a mobile
    dashboard class row already does — one deep-link contract, two route shapes.
19. There is no Recharts on mobile. The chart is drawn with `react-native-svg` through a
    generic chart primitive (`apps/mobile/src/components/charts/`) that takes a series of
    `{ label, value }` and renders bars or a line, so `attendance.absences` and the Presences
    tab can reuse it rather than each growing their own.

### Acceptance Criteria

#### ATTENDANCE-HISTORY-1: Student sees their own attendance history
- **Given** a signed-in student with attended classes in the current month
- **When** they open `/attendance`
- **Then** the attendance chart renders, the range controls `1W` / `1M` / `1Y` / `…` are shown
  below it, and the attended classes are listed underneath with their dates

#### ATTENDANCE-HISTORY-2: Range presets re-query and re-bucket
- **Given** a student on `/attendance`
- **When** they select `1Y`
- **Then** the request covers the current year and the response granularity is `month`
- **And** when they select `1W`, the request covers the current week and the granularity is `day`

#### ATTENDANCE-HISTORY-3: Custom period and Clear
- **Given** a student on `/attendance`
- **When** they open `…` and set a "from" and "to" date
- **Then** the chart re-renders for that period with a granularity derived from its span
- **And** a `Clear` control appears; activating it drops the custom period and restores the
  preset view

#### ATTENDANCE-HISTORY-4: Coach opens a roster player's attendance
- **Given** a coach viewing the profile of a player on their roster
- **When** they follow the attendance link
- **Then** they land on `/players/:playerId/attendance` and see that player's attendance history

#### ATTENDANCE-HISTORY-5: A coach cannot read a non-roster player's attendance
- **Given** a coach with no `Association_CoachPlayer` row for player X
- **When** they `GET /api/app/attendance_history?playerId=X`
- **Then** the request is rejected with 403 and no attendance data is returned

#### ATTENDANCE-HISTORY-6: A student cannot read another student's attendance
- **Given** a signed-in student
- **When** they `GET /api/app/attendance_history?playerId=<another player's id>`
- **Then** the request is rejected with 403

#### ATTENDANCE-HISTORY-7: History row opens that exact class
- **Given** a student on `/attendance` with at least one attended class
- **When** they click that class in the history list
- **Then** they land on `/calendar` showing that class's week with its detail sheet open

#### ATTENDANCE-HISTORY-8: Only attendance is shown
- **Given** a student with both attended and missed classes
- **When** they open `/attendance`
- **Then** only the attended classes are counted and listed; missed classes never appear

#### ATTENDANCE-HISTORY-9: Student sees their own attendance history on iOS
- **Given** a signed-in student on the mobile dashboard
- **When** they tap the "Attended" KPI tile
- **Then** the attendance screen opens with the chart, the range controls `1W` / `1M` / `1Y` /
  `…` below it, and the attended classes listed underneath

#### ATTENDANCE-HISTORY-10: Coach reaches a roster player's attendance from iOS player detail
- **Given** a coach on a roster player's detail screen
- **When** they tap the attendance action
- **Then** the same attendance screen opens for that player, subtitled with their name

#### ATTENDANCE-HISTORY-11: The buckets follow the length of the range and leave no gap (rules 4, 5)
- **Given** ranges of a week, a year and five years
- **When** the history is bucketed
- **Then** a range whose end is at most `31` days after its start is bucketed by day, one of at most `550` days by month, and a longer one by year
- **And** every period in the range has a bucket, the empty ones included, across a year's end too
- **And** the Presences trend is filled the same way
test: `backend/padel_app/tests/test_attendance_history_buckets.py` › `test_a_full_month_is_still_daily` (+8 more)

#### ATTENDANCE-HISTORY-12: Ranges are counted on the club's calendar, whatever the device's time zone (rules 6, 10)
- **Given** a device whose clock reads 23:30 UTC on a summer evening, when it is already the next day at the club
- **When** the presets, the Presences week and the default range are worked out
- **Then** the month preset is the club's month, first day to last, and the week preset the club's week, Sunday to Saturday
- **And** the Presences week is that week moved by whole weeks, and its label names the week that was asked for
- **And** with no range the server answers for the club's current month
- **And** a class's date keeps its own calendar day when it is read and shown
test: `frontend/apps/mobile/src/features/attendance/date-ranges.test.ts` › `round-trips a bare date` (+18 more)

#### ATTENDANCE-HISTORY-13: The chart draws what the server sent, labelled in the app's language (rules 4, 5, 19)
- **Given** a history answer with its buckets and the granularity the server chose
- **When** the attendance chart is built
- **Then** each bucket's count is plotted as sent, zeros included, and an empty answer plots nothing
- **And** up to seven buckets are labelled by weekday and more by day number; months and years by their names, in the app's language
- **And** the chart's spoken label names the series and each period that has classes, or says there is no attendance
test: `frontend/apps/mobile/src/features/attendance/attendance-series.test.ts` › `names the series and every period that has data` (+9 more)

#### ATTENDANCE-HISTORY-14: The phone's chart keeps whole numbers on its axis and every mark inside the plot (rule 19)
- **Given** a series of counts drawn on the phone
- **When** the chart is laid out
- **Then** the axis ends one above the tallest count and never below 4, with whole-number ticks from zero
- **And** the bars sit in equal slots, as tall as their count, no wider than their cap, and a count of zero draws no bar
- **And** a line's points sit on the centres of those slots
- **And** at most seven labels are shown, the first and the last among them
test: `frontend/apps/mobile/src/components/charts/chart-geometry.test.ts` › `shares the bar slot centres, so line and bars align` (+23 more)

### Notes
- Source: ticket PAD-114. iOS parity: PAD-162 (from the PAD-152 parity audit, finding A1).

### Open questions

- **Rule 4 says the buckets are "computed from `start_datetime` in UTC"; the code buckets on the club's clock.** `attendance_history_service.py:50-61`; stored times are the club's wall clock. The service's own docstring still says UTC. Rule 4's "18 months" is the constant 550 days, and no test sits on the 31-day or the 550-day edge. Recommendation: say "on the club's calendar" and "550 days" in rule 4, and add the two edge tests.
- **Rule 6 applies the default month "when no `from`/`to` is supplied"; the server applies it unless both are supplied.** A request with only one of the two silently gets the current month (`frontend_api.py:1463`). Recommendation: answer 400 for half a range, or say so in rule 6.
- **Three tests cannot fail for the reason their names give.** "uses UTC, not the device timezone" checks a month start that is the same in both zones; the two "keeps its own day" tests never leave UTC arithmetic. Recommendation: pin the process time zone in those tests.
- **The web custom-period check has no test.** iOS uses a shared helper (pointed at ATTENDANCE-HISTORY-3); web repeats the check inline in `AttendanceRangeControls.tsx:58-62`. Recommendation: use the helper on web.
