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
- **Lesson** (`lessons`): title, description, start_datetime, end_datetime, is_recurring, recurrence_rule (JSON RRULE), recurrence_end, type (academy|private), default_level_id, max_players, color, status (active|ended), notifications_enabled, club_id, series_id + excluded_dates (PAD-275, `classes.recurrence` rules 6–7, held)
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

### Acceptance Criteria

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
