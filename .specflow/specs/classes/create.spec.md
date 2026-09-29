---
id: classes.create
status: implemented
depends_on: [clubs.crud, levels.coach-levels]
implements: ../../specs-business/classes/coach-schedules-recurring-classes.business.md
governed_by: []
---

# classes.create


### Intent
Coaches create classes (lessons) that can be one-off or recurring. Classes are the template; instances are the actual scheduled occurrences.

### Entities
- **Lesson** (`lessons`): title, description, start_datetime, end_datetime, is_recurring, recurrence_rule (JSON RRULE), recurrence_end, type (academy|private; a `private` lesson defaults to automatic invitations off and open spots hidden, PAD-429: `notifications.toggle-class` rule 5, `eligibility.open-spot-visibility` rule 3a), auto_invites (nullable tri-state, PAD-429), default_level_id, max_players, color, status (active|ended), notifications_enabled, club_id, series_id + excluded_dates (PAD-275, `classes.recurrence` rules 6–7, held)
- **Association_CoachLesson** (`coach_in_lesson`): coach_id, lesson_id — unique on (coach_id, lesson_id), indexed on lesson_id
- **Association_PlayerLesson** (`player_in_lesson`): player_id, lesson_id — unique on (player_id, lesson_id), indexed on lesson_id

### Rules
1. Type is `academy` (group) or `private` (1-on-1)
2. Recurrence stored as JSON in `recurrence_rule` field (not iCal RRULE string)
3. `recurrence_end` sets when recurring series stops
4. `max_players` caps enrollment
5. Coach and enrolled players are linked via junction tables
6. Creating a lesson with `notifications_enabled=true` schedules reminder jobs
7. **Court (PAD-194).** The payload may carry `courtId`; it must be one of the class's club's courts
   (`clubs.courts` rule 6), else 400 `court_not_in_club`. The court is optional and defaults to none.

8. **A class needs a name and a capacity (PAD-390, B-136).** `POST /api/app/add_class` refuses,
   before anything is written, a missing, empty or blank `name` and a `maxPlayers` that is not a
   positive integer — 0, null, `""`, a fraction, text, or an absent key (0 is not a legal capacity,
   decided 2026-09-21) — with `400 {"error": "invalid_fields", "fields": [...]}` naming every such
   field (`title`, `max_players`); both used to reach the NOT NULL column as an IntegrityError, or
   a KeyError — a 500. The check parses exactly as the write does: an integer string ("6") is the
   number; "6.0" is refused, never a 500. The same check guards
   `POST /edit_class` (`classes.edit` rule 7).
9. **How a recurring series ends: a date, a number of classes, or the season (PAD-463, D151).**
   Class creation on web (add-class sheet) and iOS (new class) offers one choice of three, the
   first selected by default:
   - **"Termina no dia [data]"**: the end date, as before.
   - **"Termina ao fim de [N] aulas"** (N from 1 to 52, `MAX_REQUEST_CLASSES`): the client turns
     the count into the end date the wire already carries, with PAD-428's shared
     `endDateAfterClasses` (`@levelup/config`). It counts classes, not weeks, from the start date
     inclusive, on the chosen weekdays, and the series gets **exactly N** classes. The series
     expands only through `calendar_tools.expand_occurrences`: a plain weekly rule up to an
     inclusive end, with no season, holiday or clash skip. The calendar's `daysOfWeek` is
     0 = Sunday … 6 = Saturday, so Sunday is mapped to the helper's ISO 7. The backend and older
     builds are untouched.
   - **"Termina no fim da época"**: `recursUntilSeasonEnd`, exactly as `calendar.seasons` rules
     9 and 13 describe.

   A count is the coach's own number: **it is never capped by the season.** When the coach has a
   season and the Nth class falls after the end of the occurrence containing the start date, the
   form says so, with that last date. This is a note, not a block. A series ended by a count is
   not flagged `recurs_until_season_end`, so a later season edit does not re-cap it (the same as
   an explicit end date).

### Acceptance Criteria

#### A series that ends after N classes has exactly N (rule 9, PAD-463)
- **Given** a coach creating a class recurring on Sunday and Wednesday from Sunday 2026-10-04
- **When** they choose "Termina ao fim de 5 aulas" and save
- **Then** the class is sent with `endDate` 2026-10-18 (Sun 4, Wed 7, Sun 11, Wed 14, Sun 18) and
  the series has exactly 5 occurrences, the last on 2026-10-18

#### A count past the season end is noted, not capped (rule 9)
- **Given** a coach whose season ends on 2027-07-31, creating a class recurring on Mondays from 2027-07-05
- **When** they choose "Termina ao fim de 6 aulas"
- **Then** the form notes that the last class, 2027-08-09, falls after the season's end, and saving
  still creates 6 classes

#### Create one-off class
- **Given** an authenticated coach in club 1
- **When** they POST to `/api/app/class` with `{"title": "Monday Beginners", "start_datetime": "2026-04-13T10:00", "end_datetime": "2026-04-13T11:00", "type": "academy", "max_players": 6}`
- **Then** a Lesson record is created with `is_recurring=false`
- **And** a `coach_in_lesson` association is created

#### Create recurring class
- **Given** an authenticated coach
- **When** they POST with `is_recurring=true` and `recurrence_rule={"frequency": "weekly", "daysOfWeek": [1]}`
- **Then** a Lesson record is created with the recurrence config
- **And** reminder jobs are scheduled for the next 60 days of occurrences

#### A class without a name or a legal capacity is refused (rule 8)
- **Given** the coach's usual class body
- **When** it is sent with `"maxPlayers": 0` (or null, `""`, 2.5, "abc", or no key), or with `"name": ""`
- **Then** the answer is 400 with `fields` `["max_players"]` / `["title"]` — both when both — and no class exists
- **When** it is sent with `"maxPlayers": "6"`
- **Then** the class is created with capacity 6
