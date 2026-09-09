---
id: calendar.seasons
status: implementing
depends_on: [calendar.view, classes.create, attendance.history]
implements: ../../specs-business/calendar/coach-plans-classes-within-seasons.business.md
governed_by: [R-022, R-024]
---

# calendar.seasons


### Intent
A coach has **one** season, defined once as a day/month start and a day/month end (no year), that
repeats every year — "1 September to 31 July" is the whole definition. A recurring class can be set
to "recur until season end" and the system works out which occurrence of the season the class
belongs to from its first date; attendance and absence views can be read "for this season".

Until PAD-82 a coach could keep several absolutely-dated seasons that were allowed to overlap, so
"until the end of the season" and "stats by season" were ambiguous, and the majority of coaches
had no season at all (PAD-91: 2 of 3). The single recurring definition removes the ambiguity by
construction — the DB holds at most one row per coach — and the coach never has to re-create the
season each September.

### Entities
- **CoachSeason** (`coach_seasons`): `id`, `coach_id` (FK → `coaches.id`, ON DELETE CASCADE,
  **UNIQUE**), `label` (String(120), nullable — display only), `start_day`, `start_month`,
  `end_day`, `end_month` (SmallInteger, NOT NULL), `needs_review` (Boolean, NOT NULL, default
  false). Owned by exactly one coach. Nothing references it by id.
- **SeasonLegacy** (`seasons_legacy`): a verbatim snapshot of the pre-PAD-82 `seasons` rows
  (`id`, `coach_id`, `name`, `start_date`, `end_date`, `archived_at`). Written by the migration,
  never read by the app; it exists so the migration can be reversed and so support can answer "what
  was my season" without a DB dump. Not registered in the generic editor.
- **WRITES:** Lesson — `recurrence_end` is re-capped for lessons flagged `recurs_until_season_end`
  whenever the definition changes.

### Rules
1. **One definition per coach.** `coach_seasons.coach_id` is UNIQUE at the DB level, so no write
   path — the coach routes, the generic editor, a script — can give a coach two seasons.
2. **A definition is a day/month range.** `start_month`/`end_month` are 1–12; `start_day`/`end_day`
   are 1–31 and valid for their month (30 April is fine, 31 April is not; 29 February is allowed
   and clamps to 28 in a non-leap year). Start and end may not be the same day/month.
3. **Occurrences.** The definition *wraps* the year when `(end_month, end_day) < (start_month,
   start_day)` — 1 Sep → 31 Jul is the production case (PAD-91: every real season wraps). For a
   date `d` in year `Y`: a non-wrapping definition's occurrence is `[start@Y, end@Y]` when it
   contains `d`, else none; a wrapping definition's occurrence is `[start@Y, end@Y+1]` when
   `d >= start@Y`, `[start@Y-1, end@Y]` when `d <= end@Y`, else none. "None" is a **gap** — a date
   the season does not cover (August for 1 Sep → 31 Jul). The **next** occurrence after a date is
   the first one whose start is after it. Occurrence labels are the coach's `label` when set,
   otherwise `"2026/2027"` for a wrapping occurrence and `"2026"` for a non-wrapping one.
4. **The same maths on every side.** The occurrence rules live once per language:
   `padel_app/tools/season_dates.py` (pure functions, no ORM; the migration carries an inlined copy,
   since migrations never import application code, and a test checks the two agree) and
   `@levelup/config` `season-coverage.ts` (`seasonOccurrenceContaining`, `nextSeasonOccurrence`),
   both pinned by unit tests with the same cases (wrapping, non-wrapping, gap, 29 February).
5. `GET /app/season` (coach) answers `null` when the coach has no definition, otherwise
   `{"label", "startDay", "startMonth", "endDay", "endMonth", "wrapsYear", "needsReview",
   "current": {"startDate", "endDate", "label"} | null, "upcoming": {…} | null}` — `current` is the
   occurrence containing today (null in a gap) and `upcoming` the next occurrence starting after
   today.
6. `PUT /app/season` (coach) with `{"label"?, "startDay", "startMonth", "endDay", "endMonth"}`
   creates or replaces the coach's definition and answers the rule-5 shape. Rule 2 violations are
   400 `{"error": …, "code": "invalid_season"}` and write nothing. A successful save clears
   `needs_review` and **re-caps** every lesson of the coach flagged `recurs_until_season_end`: its
   `recurrence_end` becomes the end of the occurrence containing the lesson's start date (or of the
   next occurrence when the start falls in a gap), and instances strictly after that end are
   pruned; past and held instances are never touched.
7. `DELETE /app/season` (coach) removes the definition (204). Lessons keep the `recurrence_end`
   already snapshotted — a materialised decision is never rewritten — and new classes cannot
   "recur until season end" until a definition exists again (rule 9).
8. **Legacy read.** `GET /app/seasons` keeps answering the pre-PAD-82 list shape — `[]` or one
   entry `{"id", "name", "startDate", "endDate"}` for the current-or-upcoming occurrence — so the
   TestFlight build shipped before this change (mobile build 14) still renders. `POST
   /app/add_seasons` and `POST /app/delete/season` are gone (404). The shim is removed once a
   build carrying the new Settings screen is on TestFlight.
9. **"Recurs until season end" fails closed, per occurrence.** `POST /app/add_class` with
   `recursUntilSeasonEnd` snapshots the end of the occurrence containing the class's start date
   into `lessons.recurrence_end`. With no definition, or a start date in a gap, the create is
   rejected with 400 `{"error": …, "code": "no_season_covers_date"}` and nothing is written. A
   fallback horizon is deliberately NOT used.
10. **`recurs_until_season_end` implies a bounded recurrence.** A flagged lesson never carries a
    NULL `recurrence_end` (NULL is read everywhere downstream as "no end").
11. **Migration (`pad82_single_recurring_season`), idempotent and silent.** Every DDL step is
    guarded (prod carries unmigrated drift). It snapshots `seasons` into `seasons_legacy`; for each
    coach with rows picks the one with the greatest `start_date` (the most recent intent — never a
    union of ranges), derives day/month from it, keeps `name` as `label`, and sets `needs_review`
    when the coach had more than one row or the row spanned more than 400 days; coaches with no
    row get no definition. Then, for flagged lessons whose `recurrence_end` is NULL and whose coach
    now has a definition, it caps at the containing occurrence's end — unless the start is in a gap or
    within 30 days of that end, in which case the next occurrence's end: the two production rows start
    on 2026-07-24 under 1 Sep → 31 Jul, and "until season end" ticked a week before the season ends
    means the season about to start (PAD-91's option (b)). The heuristic exists only for these legacy
    rows; the live paths (rules 6 and 9) never apply it. Finally it
    drops `seasons`. Downgrade rebuilds `seasons` from the snapshot. No coach-facing reconciliation
    UI: PAD-91 showed every trigger empty in production; `needs_review` is kept as data only.
12. **Settings → Calendar (web and iOS, R-024).** One card: an optional label, a start day/month
    pair and an end day/month pair (selects, not free text), a live preview line of the
    current-or-upcoming occurrence in the coach's language, **Save** and **Remove season** (with a
    confirm). The empty state says there is no season yet and what defining one enables. A rule-2
    rejection is shown inline under the fields.
13. **Class creation (web and iOS).** The "recurs until season end" toggle keeps its hint, and iOS
    keeps warning before the round trip by asking the definition whether an occurrence contains the
    chosen date (rule 4's shared function). Web renders the backend's `no_season_covers_date`
    rejection in place as before. The message now says "Define your season in Settings → Calendar".
14. **Stats by season (web and iOS).** The attendance and absence history views gain a **Época /
    Season** range preset next to 1W / 1M / 1Y, shown only to a coach whose definition has a
    current occurrence; picking it re-queries `/attendance_history` or `/absence_history` with the
    occurrence's `from`/`to`, so every number the coach reads "for this season" is derived from the
    single definition at read time. Historical presences carry no season link (PAD-83), which is
    exactly why this is a date predicate and not a stored key.

### Acceptance Criteria

#### Occurrence maths agree across sides
- **Given** the definition 1 Sep → 31 Jul
- **When** the containing occurrence is asked for 2026-10-15, 2027-03-01 and 2026-08-10
- **Then** the first two answer 2026-09-01 → 2027-07-31 and the third answers none (a gap), and the next occurrence after 2026-08-10 starts 2026-09-01
- **Given** the definition 1 Feb → 30 Jun
- **When** asked for 2026-04-01 and 2026-07-01
- **Then** the first answers 2026-02-01 → 2026-06-30 and the second answers none
- **Given** a definition ending 29 Feb
- **When** the occurrence for 2027-01-10 is asked
- **Then** its end is 2027-02-28

#### Saving a definition
- **Given** a coach with no definition
- **When** they PUT `{"label": "Época", "startDay": 1, "startMonth": 9, "endDay": 31, "endMonth": 7}`
- **Then** the response is 200 with `wrapsYear: true`, and `GET /app/season` answers the same definition
- **When** they PUT again with 15 Sep → 30 Jun
- **Then** the coach still has exactly one row, now 15 Sep → 30 Jun

#### An invalid definition is rejected
- **Given** any coach
- **When** they PUT 31 Apr → 30 Jun, or 13th month, or 1 Sep → 1 Sep
- **Then** each response is 400 `invalid_season` and nothing is written

#### A saved definition re-caps flagged classes
- **Given** a coach with a definition 1 Sep → 31 Jul and a flagged weekly class starting 2026-10-05 capped at 2027-07-31 with instances into July
- **When** they save the definition as 1 Sep → 31 May
- **Then** the class's `recurrence_end` is 2027-05-31 and its instances after that date are gone, while earlier instances stay

#### Removing the definition keeps history
- **Given** a coach with a definition and a flagged class capped at 2027-07-31
- **When** they DELETE `/app/season`
- **Then** `GET /app/season` is `null`, the class still ends 2027-07-31, and creating a new class with `recursUntilSeasonEnd` is 400 `no_season_covers_date`

#### The legacy list still reads
- **Given** a coach with the definition 1 Sep → 31 Jul, on 2026-10-15
- **When** they GET `/app/seasons`
- **Then** the response is a one-element list whose `startDate` is 2026-09-01 and `endDate` 2027-07-31
- **And** `POST /app/add_seasons` is 404

#### "Recurs until season end" snapshots the occurrence end
- **Given** a coach with the definition 1 Sep → 31 Jul
- **When** they create a recurring class starting 2026-10-05 with `recursUntilSeasonEnd: true`
- **Then** the lesson is created with `recurrence_end` = 2027-07-31
- **When** they create one starting 2026-08-10
- **Then** the response is 400 `no_season_covers_date` and no lesson exists

#### Migration collapses the old rows
- **Given** the migration source
- **Then** every `create_table`, `drop_table` and column step is guarded by an existence check, the collapse orders a coach's rows by `start_date` descending and takes the first, and its inlined occurrence maths agrees with `padel_app.tools.season_dates`
- **Given** old rows 2026-09-01 → 2027-07-31 for coach A, two overlapping rows for coach B, and none for coach C
- **When** the collapse function runs
- **Then** A gets 1 Sep → 31 Jul with `needs_review` false, B gets the row with the later start and `needs_review` true, and C gets nothing
- **Given** flagged lessons with NULL `recurrence_end` under A's definition starting 2026-07-24, 2026-08-10 and 2026-06-15
- **When** the cap function runs
- **Then** the first two get 2027-07-31 (a late start and a gap both mean the coming season) and the third gets 2026-07-31

#### The coach defines the season in Settings on web
- **Given** the seeded coach on Settings → Calendar
- **When** they pick 1 September to 31 July and save
- **Then** the preview reads the current-or-upcoming occurrence (e.g. "1 Sep 2026 – 31 Jul 2027"), a reload shows the same values, and a class created "until season end" on a covered date lands on the calendar
- **When** they pick 31 April as the start and save
- **Then** an inline message says the day is not valid for that month and nothing changes
- **When** they remove the season and confirm
- **Then** the empty state is back

#### Same screen on iOS
- **Given** the coach on Settings → Calendar in the app
- **Then** the same card, selects, preview, save and remove exist, with the same strings

#### Stats for this season
- **Given** the seeded coach with a definition whose current occurrence contains today, viewing a player's attendance history
- **When** they pick the **Season** preset
- **Then** the request carries the occurrence's `from`/`to` and the payload's `from`/`to` echo them
- **Given** a student on their own attendance page
- **Then** no Season preset is offered

### Notes
- Source: PAD-82 (this), PAD-83 (investigation: zero inbound FKs, stats have no season link),
  PAD-91 (production profile: one season, wrapping, two unbounded flagged lessons), PAD-8/PAD-89/
  PAD-90 (the previous contract, whose fail-closed rule survives as rule 9).
- Decision: the two production lessons starting 2026-07-24 are capped at the **next** occurrence's
  end (2027-07-31), not the containing one that ends seven days later — a 30-day late-start horizon
  in the migration only. Re-run PAD-91's eight queries before promoting to prod.
- Decision: students get no Season preset in v1 — a student can have several coaches and the
  definition is per coach. A per-coach preset on the student side is a follow-up.
- Decision: no reconciliation banner (PAD-91), `needs_review` is data only.
- Decision: `GET /app/seasons` shim exists only for mobile build 14; remove with the next build.
- The old `seasons` table had no constraint of any kind; the generic-editor write paths (PAD-88)
  now hit `UNIQUE(coach_id)` and the rule-2 checks live in the service, so a semantically wrong
  editor row is still possible — the same caveat as before, one table narrower.
