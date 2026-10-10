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
8a. **A class time is a real HH:MM (PAD-508, B-275).** `startTime` and `endTime` are `HH:MM`
   (00:00–23:59). Anything else — an empty or blank string, null, an absent key, one digit, "25:00",
   "09:60", seconds — is refused before anything is written with the same `400 {"error":
   "invalid_fields", "fields": [...]}` naming `start_time` / `end_time`; it used to raise inside
   `build_datetime` — a 500. The web sheet never sends one: its time field (rule 8b) cannot be left
   empty, and should a time still be invalid the sheet flags the time box and lists "Hora" in the
   missing-fields message instead of sending. iOS's picker always holds a value. The same check
   guards `POST /api/app/edit_class` (`classes.edit` rule 7).
8b. **The desktop class-time field (PAD-508, owner decision 2026-10-03).** On web, the new-class
   sheet's start and end times — and the class editor's (`classes.edit` rule 7b) — are one field
   each that the coach can type into or pick from a list:
   - **Typing:** written as spoken — "930", "9:30", "9h30", "21.15" — and read as `HH:MM` on Enter
     or on leaving the field. Any time can be typed, quarter hours or not ("09:10").
   - **List:** a click opens every quarter hour from 06:00 to 23:45, scrolled to the current time.
     Choosing one sets it and closes the list.
   - **End:** its list starts after the start time and shows each option's class length beside it
     ("19:00 · 1 h", "19:30 · 1 h 30 min"); from a 23:45 start the list is empty and the end is
     typed. When the start reaches or passes the end, the end moves (create keeps its existing
     behaviour: start plus the default length). An end typed at or before the start is flagged and
     nothing is sent ("A hora de fim tem de ser depois da hora de início"), as iOS's new-class
     screen already does.
   - **Never empty, never zero:** text that is not a time — an emptied field included, however
     long it is left — puts the last valid time back. **One exception (PAD-524):** a clone opens with the start
     empty until the coach first sets it, and Create waits for it (`classes.clone` rule 5). Leaving the field (Tab, a click elsewhere)
     commits what was typed, whether or not the list is open. This replaces the browser's native time
     input, whose cleared segment read as empty and fell back to "zero" (the report behind PAD-508
     and B-275).
   - **Web only, with the reason:** iOS keeps its native time wheel (`classes.create` rule 10's
     sheet), which always holds a value and already reads as the platform's time control; the
     native picker is the better phone control and has none of the desktop field's problem. The
     other web time fields (events, blockers, working hours) are unchanged. ~~**Not this ticket:**
     moving through the list with the arrow keys.~~ (Superseded by rule 8c, PAD-559.)

8c. **The time field works with the wheel, the trackpad, the keyboard and the finger (PAD-559;
   owner's ticket, decision "fix the PAD-508 field, do not replace it" by the orchestrator on
   2026-10-09, owner veto open; rule number self-assigned, unconfirmed).** The ticket's report —
   "no MacBook + Safari a barra desaparece e funciona mal" — has a cause the ticket only saw as a
   symptom: the list was a popover portaled OUTSIDE the sheet's dialog, whose scroll lock cancels
   wheel and touch scrolling on everything outside it, so with macOS's hidden scrollbar the list
   could not be moved at all (Windows still dragged the visible bar). Rule 8b's field stays —
   same test ids `add-class-start-time` / `add-class-end-time` and the editor's
   `class-detail-start-time` / `-end-time`, same typing, same never-empty, same PAD-524 clone —
   and gains:
   - **Scroll:** the list renders inside the sheet (no portal past the dialog's scroll shard), so
     the wheel, the trackpad with its inertia and a finger scroll it; nothing depends on a visible
     scrollbar. Pinned by a WebKit Playwright test that scrolls the open list with the wheel
     ([[scroll-tests-must-use-the-wheel]]); red on the portaled list, green on the fixed one.
   - **Keyboard:** ↑ / ↓ move the highlighted option a quarter hour (from the typed or current
     value), Enter commits the highlighted option (or the typed text, as before), Esc closes the
     list and keeps the value. The field is a combobox (`role="combobox"`, `aria-expanded`,
     `aria-controls`, `aria-activedescendant` on the highlighted `role="option"` of the
     `role="listbox"`), so a screen reader announces the list and the choice.
   - **Touch:** every option is at least 44 px tall on a touch pointer (`sm` density stays
     desktop-only), and tapping chooses it.
   - **Opens near now:** a NEW class's start, when the field has no value yet (a clone's, rule
     8b's one empty case) or the sheet's default, opens the list scrolled to the next quarter hour
     from the club's clock, never to 06:00; a field with a value opens at that value, as before.
     The last start the coach chose in this browser session is remembered (`sessionStorage`) and
     is the new-class default start instead of 09:00.
   - **End suggested from the usual length:** the new-class end is the start plus the coach's
     usual class length — the median length of the classes on the calendar the sheet opened from,
     rounded to the quarter hour, else 60 min — and moves with the start keeping that length (the
     editor keeps rule 7b's own length). **Never before the start:** an end typed at or before the
     start is refused in the field itself — it snaps to the start plus the usual length and the
     rule-8b message shows — so the form never sees one; the end list keeps starting after the
     start.
   - **Steps:** the list stays on quarter hours; any minute can still be typed (rule 8b).
   - **One field everywhere:** the same component replaces the native `<input type="time">` on
     the other web time fields — events (`AddEventSheet`, `EventDetailSheet`), blockers
     (`BlockerSheet`), class-request proposals (`ClassRequestsSection`), reminder time
     (`RemindersSection`), restriction quiet hours (`RestrictionsPanel`), working hours
     (`WorkingHoursSection`) — with their test ids kept and no end/length behaviour where they had
     none. This part may ship as a second PR if it threatens the first's date (orchestrator,
     2026-10-09).
   - **iOS in step** (`time-picker-input`): the native wheel stays, and the field also accepts a
     typed "18:30" (a numeric text entry beside the wheel; invalid text keeps the last value), its
     touch target is at least 44 pt, the new-class end is suggested from the same usual length
     (iOS reads the day's classes, which is what its new-class screen loads; else 60) and an end
     at or before the start is refused in the field, on the wheel and on the typed entry alike;
     the arrow keys do not apply. Android follows through the same Expo component.
   - **Platforms to prove before closing (the ticket's list):** Playwright on Chromium and WebKit
     (macOS Safari engine), the iOS app on the simulator, the Android emulator lane. Windows
     (Chrome, Edge) cannot be tested on this machine: the orchestrator arranges an owner check
     before promotion; the PR says so.
8c. **(PAD-553, B-346; number unconfirmed) A class that ends at midnight ends the next day.** An end
   of exactly 00:00 after a later start is 00:00 of the NEXT day, on every path that writes a class
   or an occurrence (create, materialisation, an edit, the import), and the calendar's
   "completed" status reads it the same way. It was stored at 00:00 of the
   class's own day, before its start, so every "has it ended" reader (attendance validation, the
   pending count, the "this and future" walk) treated it as over from midnight. Any other end at or
   before the start is a typed mistake, not a midnight class, and is not moved (B-294 refuses it).
   A repair migration moved the stored rows that end at 00:00 before their start; its downgrade
   is a no-op, because a repaired row cannot be told from a correct one.

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

10. **The coach chooses the students when creating a class, on web and in the mobile app (iOS and
    Android) (PAD-474, B-239).** Both create forms carry a participant picker (web: the add-class
    sheet's `PlayerSelector`; mobile: the new-class screen). It lists the coach's students, with a
    search (every typed word, in any order: `players.list` rule 3, PAD-516), a filter by level, and a
    mark on any student outside the class's level. **Every student's level is visible (PAD-527):** a
    chip with the level code, in the primary colour when it is the class's level, amber when it is
    another level or none ("No level"), neutral when the class has no level; one rule for both shells
    (`@levelup/config` `classLevelMatch`). A chosen student
    is sent in `playerIds` and joins the series roster (rule 5); `classes.instance-enrollment` rule 11
    tells them. The picker applies no cap at `maxPlayers`; it shows the count. **Every student
    in the list can be reached (PAD-502, B-271):** the list has a fixed height and scrolls inside
    it, by wheel, trackpad or finger, whatever its length and whichever filter is on; the picker
    shows no "first N". Web uses a native `overflow-y: auto` list (a Radix ScrollArea with only a
    max height showed four rows and clipped the rest); the mobile app uses a ScrollView. When students are
    chosen, the PAD-107 warning (`calendar.student-blockers` rule 9) runs before saving, after the
    overlap warning; if that lookup fails, the class still saves. Create runs no eligibility check
    (`eligibility.enforcement` rule 7d covers an edit that adds students).
    **Picking from a search clears it (PAD-518).** When the coach ticks a student in the search
    results, the search empties so the next name can be typed at once; on web the cursor stays in
    the field. Unticking a student leaves the search as it was. The same picker serves the class
    editor (`classes.edit` rule 9), so both get it, on both shells.

### Acceptance Criteria

#### The picker shows every student's level, coloured by the class's level (PAD-527)
- **Given** a class at level I1 and students Rui (I1), Sara (B2) and Tomé (no level)
- **When** the coach opens the participant picker, on web or iOS
- **Then** Rui's chip reads I1 in the primary colour, Sara's reads B2 in amber and Tomé's reads "No level" in amber
- **And** for a class with no level, Rui's and Sara's chips are neutral and Tomé has none

#### An invalid time is refused by the server (rule 8a, B-275)
- **Given** `POST /api/app/add_class` or `/edit_class` with `startTime: ""` (or null, absent, "9",
  "25:00")
- **Then** it answers 400 naming `start_time`, and nothing is written

#### The time never reverts to zero (rule 8b, PAD-508)
- **Given** the web new-class sheet with a name, start 18:00 and end 19:30
- **When** the coach empties the start time, leaves it alone for a while, and moves on
- **Then** the start reads 18:00 again, nothing is flagged, and Create class sends 18:00–19:30

#### The coach picks or types a time (rule 8b)
- **Given** the web new-class sheet
- **When** the coach opens the start list and picks 17:15
- **Then** the start reads 17:15 and the list closes
- **When** they open the end list
- **Then** it starts at 17:30 and each option shows the class length
- **When** they type "1930" in a time and press Enter
- **Then** it reads 19:30

#### The coach chooses students when creating a class (rule 10, PAD-474)
- **Given** a coach on the mobile app with students Ana and Bruno
- **When** they create a class and choose Ana
- **Then** the class is sent with `playerIds` `[Ana]` and Ana is on its roster
- **Given** Ana marked herself unavailable at that time
- **When** the coach saves
- **Then** the unavailable-student warning names Ana, and Confirm creates the class with her

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

#### Every student of a level can be reached in the picker (PAD-502, B-271)
- **Given** a coach with twenty students at one level, in the web add-class sheet's picker on the "all students" tab
- **When** the coach picks that level and scrolls the list with the mouse wheel
- **Then** the last of the twenty comes into view inside the list and can be ticked

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

#### Picking a student from a search clears it (rule 10, PAD-518)
- **Given** the picker's search reads "Ana"
- **When** the coach ticks Ana
- **Then** Ana is chosen and the search is empty (web: with the cursor still in it)
- **When** the coach searches "Ana" again and unticks her
- **Then** the search still reads "Ana"

#### A class that ends at midnight ends the next day (rule 8c, PAD-553)
- **Given** a coach creating a class on 5 Nov from 22:00 to 00:00
- **Then** it is stored ending at 00:00 on 6 Nov, and its occurrences end an hour after they start
- **Given** a class typed from 18:00 to 17:00
- **Then** its end is not moved (B-294's)

#### The list scrolls with the wheel inside the sheet (rule 8c, PAD-559)
- **Given** the new-class sheet open on WebKit with the start-time list open
- **When** the wheel turns over the list
- **Then** the list's `scrollTop` changes — with no scrollbar drag and no scrollbar visible

#### The keyboard walks the list (rule 8c)
- **Given** the start field focused with "09:00"
- **When** the coach presses ↓ twice and Enter
- **Then** the start is "09:30", the list is closed, and the end followed by the usual length

#### The end never precedes the start (rule 8c)
- **Given** a start of "18:00" and a usual length of 60 min
- **When** the coach types "17:30" in the end field and presses Enter
- **Then** the end snaps to "19:00" and the rule-8b message shows; nothing is sent

#### The list opens near now (rule 8c)
- **Given** a clone with its start empty at 14:07 on the club's clock
- **When** the coach opens the start list
- **Then** it is scrolled to "14:15", not to "06:00"

#### The usual length comes from the coach's classes (rule 8c)
- **Given** a coach whose calendar holds classes of 90, 90 and 60 minutes
- **When** they open the new-class sheet and set the start to "18:00"
- **Then** the end reads "19:30"; a coach with no classes gets "19:00"
