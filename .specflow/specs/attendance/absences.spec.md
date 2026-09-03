---
id: attendance.absences
status: draft
depends_on: [attendance.presence, attendance.history, classes.instances, players.list, dashboard.navigation]
implements: ../../specs-business/attendance/coach-relies-on-attendance.business.md
governed_by: []
---

# attendance.absences


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
