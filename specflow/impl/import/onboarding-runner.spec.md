---
id: import.onboarding-runner
status: implemented
depends_on: [import.confirm, import.revert]
serves: [P-IMPORT-2]
governed_by: [R-002, R-003, R-005, R-023, R-024, R-036]
---

# import.onboarding-runner

> Linear: PAD-827. Owner request, 2026-11-05: a new coach's roster is loaded by the team with a
> saved, recorded, revertible, run-once script, "like a migration file". The command is run by the
> operator, on production only with the owner's go, never by a deploy.

### Intent
One operator command loads a new coach's students, weekly classes and enrolments from a data file,
onto that coach only, exactly once, with a rehearsal mode, a full undo and a history row.

A second use of the same command (rules 15 to 29, owner decisions of 2026-11-19, stream
`history-import`): a **history run** loads what a coach recorded outside the app before using it,
the absences, guest attendances and manual adjustments of a past period, onto classes the coach
already has. It is a file with a `history` section, applied once, with a rehearsal, a full undo and
a history row, like a roster run.

### Entities
- **READS:** Coach, User, Club, CoachLevel, CoachSeason, BulkImport
- **CREATES (history run, when the file gives a season):** CoachSeason, through the season service
- **UPDATES (history run):** the coach's weekly Lessons (the start of the series, moved back, rule
  19) and the not-yet-validated Presence rows of occurrences that already exist (rule 21)
- **CREATES (history run):** LessonInstance, Presence, and one-off Lesson, Association_CoachLesson,
  Association_PlayerLesson for the adjustment lessons
- **CREATES:** User, Player, Association_CoachPlayer, PlayerLevelHistory (through `import.confirm`'s
  player creation); Lesson, Association_CoachLesson, Association_PlayerLesson (through the add-class
  service); BulkImport (one row per run)
- **DELETES:** on revert or on a failed run, exactly the rows the run created (`import.revert`)

### Rules
1. **Three commands, no other surface.** `flask onboarding apply <file> --database <name>`,
   `flask onboarding apply <file> --dry-run`, `flask onboarding revert <onboarding-id> --database
   <name>` and `flask onboarding list`. `<file>` is a path, or `-` for standard input. There is no
   route, no web screen and no iOS screen (R-024: a team tool run on the server; nobody would use
   it in an app). Nothing runs it automatically: it is not an Alembic revision, because the API
   container runs `flask db upgrade` on every start in every environment.
2. **The onboarding file is JSON and holds only data.** It is never executed. It lives outside the
   repository, which is public (R-036): it carries students' names. Shape:
   - `id`: `YYYY_MM_DD_<slug>`, lower-case letters, digits and underscores.
   - `coach`: `{id, name, club: {id, name}}`.
   - `expects`: `{players, classes}`, the coach's roster and class counts before the run.
   - `notes`: optional list of strings (transcription decisions; printed, never interpreted).
   - `players`: list of `{name, level_code?, email?, phone?, side?, link_existing?}`.
   - `classes`: list of `{title, date, start_time, end_time, max_players, type?, weekly?, until?,
     level_code?, notifications?, color?, players}`. `type` defaults to `academy`, `weekly` to
     `true`, `notifications` to `false`, `color` to the app's default class colour. `until` is `"season_end"` or a `YYYY-MM-DD` date and is required
     for a weekly class. `players` is a list of names from the file's `players`.
3. **The file is checked before the database is read.** Every problem is reported, not only the
   first, and any problem refuses the run:
   a. `id` has the shape of rule 2; `coach.id`, `coach.name`, `coach.club.id`, `coach.club.name`
      and both `expects` counts are present.
   b. Player names are non-empty and unique, comparing without accents, case or repeated spaces
      ("Júlio Exemplo" and "julio  exemplo" are the same name). No two players share an email
      (compared without case).
   c. Class titles are non-empty and unique. Every name in a class's `players` is one of the file's
      players (compared as in b) and appears once in that class.
   d. `max_players` is a positive integer and not below the class's number of players.
   e. `date` is a real date; `start_time` and `end_time` are `HH:MM` and the end is after the start
      (an end of `00:00` is midnight at the end of the day, `classes.create` rule 8d). A weekly
      class has `until`; an `until` date is not before `date`.
   f. `side`, when given, is `left`, `right` or `both`; `type` is `academy` or `private`.
   g. **No age confirmation is asked (owner decision, 2026-11-05).** An onboarding creates roster
      players whose account is a placeholder with no login. The coach's "18 or older" tick
      (`import.confirm` rule 9, `players.create` rule 10) belongs to the coach's own actions in the
      app, and a student's birth date is judged when they activate an account (`auth.activate`).
      The file has no such field; one that carries it is not refused for it.
   h. No value is longer than its column: a player's name and email 120 characters, phone 20; a
      class title 255. A longer value would otherwise fail part-way through the run.
   i. The file has at least one player, one class or a `history` section (rule 15).
4. **The target is checked before anything is written.** Any of these refuses the run:
   a. No coach with `coach.id`, or that coach's user name is not `coach.name`, or the coach's
      current club is not `coach.club.id` with the name `coach.club.name`. Names are compared after
      trimming, exactly otherwise.
   b. The coach's roster size or class count differs from `expects`.
   c. An onboarding with this `id` was applied before, whatever its status now (active or
      reverted).
   d. A `level_code` (player or class) is not a code on this coach's ladder (R-002).
   e. A player's `email` belongs to an existing user and the player does not say
      `link_existing: true`. With it, that account is put on the coach's roster
      (`import.confirm` rule 7). An account already on the coach's roster is refused either way.
   f. A player name is already on the coach's roster (compared as in 3b), or a class title is one
      the coach already has.
   g. A weekly class with `until: "season_end"` whose `date` no season of the coach covers
      (`classes.recurrence`: fail closed, never an endless series).
5. **`--dry-run` writes nothing.** It runs rules 3 and 4 and prints the plan: the database it is
   connected to, the coach and club, the counts, each class with its day, time, capacity and number
   of students, and the file's notes. Exit code 0 when the run would be accepted, 1 otherwise.
6. **A real run names its database.** Without `--dry-run`, `apply` and `revert` need
   `--database <name>` equal to the name of the database the app is connected to. A missing or
   different name refuses the run before anything is written. The rehearsal copy and production are
   told apart by this name.
7. **Students are created as an import creates them** (`import.confirm` rules 5 to 7): through
   `bulk_create_players`. A row without an email is a new user with no email and a placeholder
   username; no address is invented and no other coach's player is matched. `level_code` sets the
   level on the coach link and writes the level history row.
8. **Classes are created as the coach's "add class" creates them**: through `add_class_service`,
   with the students as the class's roster. Times are club wall-clock (R-023). A weekly class
   recurs on the weekday of `date`, until the season's end or the `until` date. The class belongs to
   the coach's club (R-003) and to the coach.
9. **No student is contacted.** `add_class_service` is called with `notify_students=False`, so the
   "you were added to a class" notification (PAD-330) is not sent. The class's
   `notifications_enabled` is the file's `notifications`, `false` unless the file says otherwise.
   No invitation, email or push is sent by a run.
10. **One history row per run.** A `BulkImport` row for the coach with
    `filename = "onboarding:<id>"`, `status = "active"`, `summary` =
    `{"Players": n, "Classes": n, "Players in Classes": n}` (zero counts left out), and `record_ids`
    holding every created id under the keys `import.revert` reads (`users`, `players`,
    `coach_players`, `player_level_history`, `lessons`, `player_lessons`), plus `_onboarding` =
    `{"id", "sha256"}`, the SHA-256 of the file's bytes. The row appears in the coach's import
    history like any import. It is written before the first record and updated as the run goes, so
    an interrupted run can be reverted.
11. **All or nothing.** If any player row or class fails, or rule 12 fails, the run deletes what it
    created through `import.revert`, removes its history row, prints what failed and exits 1. The
    `id` is then still unused. A class whose creation raised after its row was written is removed
    too: none of the file's titles existed for the coach before the run (rule 4f). A completed run is final: rule 4c refuses that `id` from then on.
12. **Ownership is proven on the created rows before the run is declared done.** Every created
    coach-player link has the target coach; every created class is in the target club and its only
    coach is the target coach; every created enrolment joins a created class to a player on the
    target coach's roster; and the created counts equal the file's (players, classes, enrolments).
13. **Revert is `import.revert` on that row.** `revert <onboarding-id>` finds the row by its
    `filename`, deletes exactly its `record_ids`, and marks it `reverted`. An unknown id, or a row
    already reverted, is refused with exit code 1.
14. **`list` prints every onboarding run**: id, coach id and name, when it was applied, status and
    summary, oldest first.

#### History runs (owner decisions of 2026-11-19: D4 to D11)
15. **A history run is a file with a `history` section.** The file keeps rule 2's shape; its
    `classes` is an empty list, and its `players` is empty or lists students the run creates on the
    coach's roster, in no class (rule 30). The section is
    `{from, through, season?, absences, guests, adjustments, sheet_totals?}`:
    - `from`, `through`: dates (`YYYY-MM-DD`), the first and the last day covered, inclusive.
    - `season`: optional, `{start_date, end_date, label?}`, the coach's season (rule 28).
    - `excluded`: optional, `{source_row, student, kind, type?, minutes, reason}`, rows of the
      source the operator chose not to load (rule 29). `kind` is `absence` or `guest`.
    - `absences`: `{date, student, type, minutes, note?, start_time?, source_row?, sheet_date?}`,
      `type` one of `justified`, `unjustified`, `coach`. `minutes` is the length the source gives
      and is a check (rule 17a). `start_time` (`HH:MM`) names the class, by its weekday and start,
      for a student who is in no class.
    - `guests`: `{date, start_time, student, minutes, source_row?, sheet_date?}`, a student who attended a class they are not
      enrolled in.
    - `adjustments`: `{student, minutes, date, start_time?, lesson_minutes?}`, a manual credit.
    - `sheet_totals`: optional, `{student, justified_minutes, unjustified_minutes, guest_minutes}`
      per student, the source's own totals. Printed beside the rows (rule 18), never enforced.
    - `expects` also carries `instances` and `coach_marks` (rule 25).
    `student` is a name compared as in rule 3b. The file holds names, so it stays outside the
    repository (rule 2).
16. **The history section is checked before the database is read** (as rule 3, every problem
    reported): `from` and `through` are real dates and `from` is not after `through`; every row's
    `date` is a real date inside `from`..`through`; `type` is one of the three; `minutes`,
    `lesson_minutes` are positive integers; `student` is non-empty; `start_time` is `HH:MM`; no two
    absence rows share a student and a date; no `note` is longer than the presence note column
    (`attendance.presence`); a `season` has real dates, `start_date` before `end_date`, a span of
    under one year, and contains `from`.
17. **Every row is resolved to a class before anything is written** (rule 4's checks, plus these).
    The classes are the coach's weekly classes as they are at the run (there is no enrolment date,
    so today's roster stands for the whole period). Any row that cannot be resolved is reported,
    with its position in the file and why, and refuses the run:
    a. an **absence** belongs to the one weekly class of the coach that the student is enrolled in
       and that falls on the row's weekday. A student in no class at all (on the roster with no
       class, or created by the run, rule 30) has no class of their own: the absence belongs to the
       coach's weekly class that starts at the row's `start_time` on that weekday, or, with no
       `start_time`, to the one weekly class of the coach on that weekday whose length is
       `minutes`. Refused when the student is not on the coach's roster (nor among the file's
       `players`), is in other classes but none that weekday, is in two or more that weekday (so
       the class cannot be told), is in no class and the coach has no such class or more than one,
       or the class's length differs from `minutes`.
    b. a **guest** row belongs to the weekly class of the coach that starts at `start_time` on the
       row's weekday. Refused when there is no such class, the student is on that class's roster
       (not a guest by today's roster), the student is neither on the coach's roster nor among the
       file's `players`, or the class's length differs from `minutes`.
    c. an **adjustment**'s student is on the coach's roster, and `minutes` divides by the
       lesson length (rule 23), which is given when the student is in no class.
    d. the occurrence the row names exists in the class's series once its start is moved (rule 19):
       not after its `until`, not an excluded date, and not after the class's cut-off (rule 20).
18. **`--dry-run` of a history file writes nothing and prints** the database, coach and club,
    `from`..`through`, the file's notes, the season to be created (rule 28), and per weekly class: its title, its start now and after
    the move, the number of occurrences to be created, its cut-off date and the date of the
    first coach-made mark that causes it (rule 20); then the unresolved rows; then the
    **expected-vs-file table**, one line per student with a row: justified, unjustified and guest
    (count and minutes), hours balance, classes owed, each computed from the file's rows and set
    beside `sheet_totals` with a ✓ or the difference. Exit code 0 when no row is unresolved and rules
    4 and 25 hold, 1 otherwise.
19. **The series start moves back first (D8).** For every weekly class of the coach that starts
    after its first date on or after `from`, the class's first occurrence is moved to that date,
    at the same wall-clock time (R-023), by the lesson edit the coach's own "edit this and all
    following classes" runs on a first occurrence (`edit_lesson_helper`): the series' start is
    rewritten in place and nothing forks. The "edit this and following" wrapper is **not** used: it
    also edits every occurrence already materialised from the new date, which would rewrite the
    coach's own instances. A class that already starts on or before that date is left as it is. The previous start of each
    moved class is recorded (rule 24). No instance that exists is touched by the move.
20. **Occurrences are materialised up to a cut-off.** For each weekly class, every occurrence from
    its start to the cut-off, the earlier of `through` and the day before the class's first
    coach-made mark (a presence of one of its instances that the coach made: `recorded_by = "coach"`, or
    validated by someone other than this import, `validated` with `recorded_by` not `"import"`, which
    covers rows validated before `recorded_by` existed; D11), is
    created if it does not exist, through the same path as the coach's calendar (the roster is
    enrolled on it), skipping excluded dates. An occurrence that is not over at the run (its end
    is not before now, club time) is never created: `through` must be before the club's local today.
21. **Marks are written on rows created through `enrol` and are validated (D9, D5).** For each
    occurrence from rule 20: each file absence is an absent row with the justification of its type
    (`coach` is a justified absence, D5) and its `note`; each file guest, and each absence of a
    student who is in no class, is a row for that student created through `enrol` with source
    `import`, present or absent; every other student on the class's roster is a present row with no
    absence in the file, so the occurrence leaves nothing to validate. The status, justification and
    note are set on the rows directly, not through the coach's attendance sheet (`add_presences`),
    so no realtime event is published and the invitation engine records no no-show. Every row
    written is `validated = true`, `recorded_by = "import"`. A row that already exists and is not coach-made
    is updated, and its previous values are recorded (rule 24); **a coach-made row is never
    written** (D11). The file's notes say that weeks with no row mean everyone present (D9).
22. **Nobody is contacted and nothing is opened.** No message, email, push or notification event
    is sent or written, no reminder job is armed, no vacancy or invitation is opened, no waiting-list
    entry is added and no invitation-engine session row is written, for any instance, presence
    or lesson the run creates. A class's `notifications_enabled` is not changed.
23. **Adjustments are one-off lessons (D6).** Each is created as rule 8 creates a class (through
    `add_class_service`, `notify_students=False`, not weekly), titled "Ajuste manual (histórico)",
    with that student alone, capacity 1, on `date`. The lesson length is `lesson_minutes`, or the
    length of the student's class (rule 17a) when absent (required for a student in no class);
    `minutes` divided by it is the number of
    lessons, and the run is refused unless it divides exactly. The lessons follow one another from
    `start_time` (09:00 when absent) the same day; a clash with the coach's own classes is not
    refused and is listed in the dry run. Each lesson's one row is an absent, justified, validated
    row (`recorded_by = "import"`).
24. **A history run records what it did.** One `BulkImport` row as rule 10, with `record_ids` keys
    `lesson_instances`, `presences`, `lessons`, `player_lessons` (every row the run created), plus
    `series_starts` (lesson id to its start before the move), `coach_seasons` (the id of the season
    the run created, rule 28) and `presence_before` (presence id to
    the values of a row the run updated). `summary` counts `Instances`, `Presences`, `Lessons` and
    `Series moved` and `Seasons` (zero left out). It is written before the first record and updated as the run
    goes.
25. **The starting state is pinned and one history run at a time.** A history file's `expects`
    also has `instances` (the number of lesson instances the coach has) and `coach_marks` (the
    number of presences the coach made, counted as rule 20 counts them); a different count refuses the
    run, naming both (as rule 4b). A coach with an active history run is refused another.
26. **All or nothing, then proof.** A failure at any step undoes the run as rule 11 does, and also
    puts back every series' start and every presence the run updated, removes the season the run
    created, and removes any occurrence the run materialised even if its id was not yet recorded
    when the failure came. Before the run is declared
    done: every created lesson and instance belongs to the target coach (rule 12's check); no
    instance of the coach between each class's start and its cut-off has a row left unvalidated;
    and, for each student with a row, the app's own presence statistics over `from`..`through` (the
    Presences tab's numbers, `attendance.validation` rule 17) equal the file's rows in justified,
    unjustified and guest counts and minutes, the hours balance and the classes owed
    (`attendance.stats` rule 3). Any difference fails the run as rule 11. The table of rule 18 is
    printed again with the app's numbers.
27. **Revert of a history run** is `import.revert` on its row (the instances, presences, lessons
    and enrolments in `record_ids`) and then restores each series' start (and its recurrence rule text) and each updated
    presence's previous values, and deletes the season the run created (rule 28). It is refused,
    nothing changed, exit code 1, when a presence it wrote has since been marked by the coach, when
    an occurrence or adjustment lesson the run created now holds a row the run did not write (a
    walk-in the coach added, say: deleting the occurrence would delete it), or when a series start is
    no longer the one the run set, naming each. The coach's own marks are never touched. Reverting the earlier roster run
    of a coach who has an active history run is refused naming it: the history run is reverted
    first.

28. **The history run creates the coach's season when the file gives one (owner, 2026-11-19).**
    A coach has at most one season, a recurring day/month range (`calendar.seasons` rules 1, 2).
    When the file has `history.season` and the coach has none, the run creates it through the
    season service the coach's settings use, as the day and month of `start_date` and `end_date`
    (2026-08-31 and 2027-07-31 are 31 August to 31 July) with the file's `label`, and records its id
    (rule 24). A coach who already has a season, whatever its dates, refuses the run before anything
    is written: the database holds one season per coach, so an overlapping one cannot be added and
    the coach's own is never replaced. A coach who has a class that follows the season end
    (`recurs_until_season_end`) also refuses it: saving a season re-caps those classes and deletes
    their future occurrences, which a revert cannot put back. The run creates no class that follows
    the season. Revert
    deletes the season only when it is the recorded one and still has the definition the run set.

29. **Rows the operator left out stay visible (owner and lead, 2026-11-19).** A source row that
    rule 17 would refuse, and that the operator decides not to load, is listed in `history.excluded`
    instead of being deleted from the file. An excluded row is never written and never resolved
    (rule 17 does not look at it). The dry run lists every excluded row (its `source_row`, student,
    kind, type, minutes and reason), and the table of rule 18 shows, per student, the excluded
    justified, unjustified and guest minutes beside `sheet_totals`, so the gap between the source's
    totals and the loaded rows is read, never hidden. Rule 26's proof compares the app with the
    **loaded** rows only; the final table prints the excluded ones again. A loaded row may carry
    `sheet_date`, the date the source wrote when the operator moved the row to another day: `date`
    is the day the run uses, and `sheet_date` is only printed beside it in the dry run. The
    file's check (rule 16) refuses an excluded row with no reason, student, kind or minutes, and a
    `source_row` that is both loaded and excluded, or given twice in either list.

30. **A history file may create students who are not on the roster (owner, 2026-11-19).** The
    names in `players` (shape and checks as rules 2 and 3b, 3h; each name unused on the coach's
    roster, rule 4f, so a student already there is written to, never duplicated) are created as
    rule 7 creates them: a user with no email and a placeholder username, a roster player of the
    coach, in **no** weekly class. They are created before any row is resolved, so rules 17a and 17b
    find them. Their ids go in `record_ids` under `users`, `players`, `coach_players` and
    `player_level_history` as rule 10 keeps them, and in `summary` as `Players`. The dry run
    prints the players to be created and gives each a line in the table of rule 18. Revert removes
    them (rule 27), after the presences that name them. A history file with `players` still needs
    `expects.players` to be the coach's count before the run (rule 4b).

### Acceptance Criteria

#### IMPORT-ONBOARDING-RUNNER-1: A dry run shows the plan and writes nothing (rule 5)
- **Given** coach 1 "Rui Coach" at club 1 "Clube Teste" with no players and no classes
- **And** a file `2026_11_05_rui_coach` for that coach with 3 players and 2 weekly classes
- **When** the operator runs `flask onboarding apply <file> --dry-run`
- **Then** the output names the database, the coach, the club, "3 players", "2 classes" and each
  class's title with its number of students
- **And** the exit code is 0 and no User, Player, Lesson or BulkImport row was created

#### IMPORT-ONBOARDING-RUNNER-2: Apply creates the students, classes and enrolments on that coach (rules 7, 8, 10)
- **Given** the same coach and file, where class "Segunda 07:00" lists 2 of the players, is dated
  Monday 2026-11-09 07:00 to 08:30, weekly until 2027-06-28, `max_players` 4
- **When** the operator runs `flask onboarding apply <file> --database <connected name>`
- **Then** the coach's roster has 3 players, each a new user with no email and a `pending-…`
  username
- **And** the coach has a class "Segunda 07:00" in club 1, starting 2026-11-09 07:00, recurring
  weekly on Monday until 2027-06-28, capacity 4, with those 2 players enrolled
- **And** a BulkImport row for the coach has `filename` `onboarding:2026_11_05_rui_coach`, status
  `active`, summary `{"Players": 3, "Classes": 2, "Players in Classes": n}` and record ids for every
  created row, plus `_onboarding.sha256` of the file

#### IMPORT-ONBOARDING-RUNNER-3: No student is contacted (rule 9)
- **Given** the same file applied
- **Then** `notify_student_added_to_class` was never called, no email was sent and no push was sent
- **And** every created class has `notifications_enabled` false
- **And** a class whose file entry says `"notifications": true` has it true
- **And** (control) the same roster passed to `add_class_service` with `notify_students=True` does
  call `notify_student_added_to_class`

#### IMPORT-ONBOARDING-RUNNER-4: A second apply is refused, also after a revert (rules 4c, 11)
- **Given** `2026_11_05_rui_coach` was applied
- **When** the operator applies the same file again
- **Then** the run is refused naming the earlier run, exit code 1, and nothing new is created
- **And** after `flask onboarding revert 2026_11_05_rui_coach --database <name>`, applying it again
  is still refused

#### IMPORT-ONBOARDING-RUNNER-5: The wrong coach is refused (rule 4a)
- **Given** a file whose `coach` is `{id: 1, name: "Another Name", club: {id: 1, name: "Clube Teste"}}`
- **When** the operator applies it
- **Then** the run is refused naming the mismatch ("Rui Coach" found), exit code 1, nothing created
- **And** the same holds for a wrong club id, a wrong club name and a coach id that does not exist

#### IMPORT-ONBOARDING-RUNNER-6: A starting state that is not the expected one is refused (rule 4b)
- **Given** the coach already has 1 player and the file says `expects: {players: 0, classes: 0}`
- **When** the operator applies it
- **Then** the run is refused naming both counts, exit code 1, nothing created

#### IMPORT-ONBOARDING-RUNNER-7: A real run must name its database (rule 6)
- **Given** a valid file
- **When** the operator runs `apply <file>` with no `--database`, or with a name that is not the
  connected database's
- **Then** the run is refused, exit code 1, nothing created
- **And** `apply <file> --dry-run` needs no `--database`

#### IMPORT-ONBOARDING-RUNNER-8: File problems are all reported before the database is read (rule 3)
- **Given** a file with the id `Wrong Id`, two players "Júlio Exemplo" and "julio exemplo", a class
  listing a player "Ghost" who is not in `players`, a class with 3 players and `max_players` 2, a
  class ending before it starts, and a weekly class with no `until`
- **When** the operator applies it with `--dry-run`
- **Then** every one of those six problems is printed, exit code 1, and the coach was never looked
  up

#### IMPORT-ONBOARDING-RUNNER-9: No age confirmation is asked (rule 3g)
- **Given** a valid file with 3 players and no age confirmation field
- **When** the operator applies it
- **Then** the run is accepted
- **And** the same file carrying `confirms_adults: false` is accepted too

#### IMPORT-ONBOARDING-RUNNER-10: Values the columns cannot hold and a repeated email are refused (rules 3b, 3h)
- **Given** a file with a player phone of 26 characters, two players with the emails
  `par@example.com` and `PAR@example.com`, and a class title of 256 characters
- **When** the operator applies it with `--dry-run`
- **Then** all three problems are printed, exit code 1, nothing created

#### IMPORT-ONBOARDING-RUNNER-11: An unknown level, a taken name and a taken title are refused (rules 4d, 4f)
- **Given** coach 1 has levels `3` and `4`, a player "Ana Lima" and a class "Segunda 07:00"
- **When** a file gives a player `level_code` `9`, a player "ana lima", or a class titled
  "Segunda 07:00"
- **Then** each is refused naming the value, exit code 1, nothing created

#### IMPORT-ONBOARDING-RUNNER-12: An existing account is joined only when the file says so (rule 4e)
- **Given** a user with email `ana@example.com` who is not on the coach's roster
- **When** a file has a player with email `ANA@example.com` and no `link_existing`
- **Then** the run is refused naming that email, nothing created
- **And** with `link_existing: true` the run creates no new user for that row and puts that account
  on the coach's roster

#### IMPORT-ONBOARDING-RUNNER-13: No season, no endless class (rule 4g)
- **Given** a coach with no season defined
- **When** a file has a weekly class with `until: "season_end"`
- **Then** the run is refused naming the class, nothing created
- **And** the same class with `until: "2027-06-28"` is accepted

#### IMPORT-ONBOARDING-RUNNER-14: A run that fails part-way leaves nothing (rule 11)
- **Given** a valid file with 3 players and 2 classes
- **And** the second class's creation raises
- **When** the operator applies it
- **Then** the exit code is 1, the coach has no players and no classes, and no BulkImport row with
  that onboarding id exists
- **And** applying the same file afterwards, with nothing failing, succeeds

#### IMPORT-ONBOARDING-RUNNER-15: Ownership is checked on what was created (rule 12)
- **Given** a valid file
- **And** a created class ends up linked to a second coach
- **When** the run reaches its ownership check
- **Then** the run fails as in rule 11 and names the class

#### IMPORT-ONBOARDING-RUNNER-16: Revert removes exactly what the run created (rule 13)
- **Given** the coach had 1 player and 1 class of their own, and a file expecting that state was
  applied, adding 3 players and 2 classes
- **When** the operator runs `flask onboarding revert <id> --database <name>`
- **Then** the 3 players, their users, the 2 classes and their enrolments are gone
- **And** the coach's own player and class are still there
- **And** the BulkImport row's status is `reverted`
- **And** reverting again, or reverting an id that was never applied, is refused with exit code 1

#### IMPORT-ONBOARDING-RUNNER-17: List shows the runs (rule 14)
- **Given** one onboarding applied and another applied then reverted
- **When** the operator runs `flask onboarding list`
- **Then** both ids are printed with their coach, date, status (`active`, `reverted`) and summary

#### IMPORT-ONBOARDING-RUNNER-18: The file comes from a path or from standard input, and must be JSON (rules 1, 2)
- **Given** a valid onboarding file for coach 1
- **When** the operator pipes it to `flask onboarding apply - --database <connected name>`
- **Then** the run is accepted and creates the file's 3 players
- **And** a file whose content is `{ not json` is refused with exit code 1, saying it is not valid JSON
test: `backend/padel_app/tests/test_pad827_onboarding_runner.py` › `test_the_file_can_come_from_standard_input` (+1 more)

#### IMPORT-ONBOARDING-RUNNER-19: A run shows in the coach's import history like any import (rule 10)
- **Given** `2026_11_05_rui_coach` was applied for coach 1
- **When** the coach's import history is read
- **Then** it lists one row: `onboarding:2026_11_05_rui_coach`, status `active`, summary `{"Players": 3, "Classes": 2, "Players in Classes": 3}`
test: `backend/padel_app/tests/test_pad827_onboarding_runner.py` › `test_the_run_shows_in_the_coachs_import_history`

#### IMPORT-ONBOARDING-RUNNER-20: Another coach at the same club gains nothing (rules 8, 12)
- **Given** a second coach who belongs to the file's club
- **When** the file is applied for coach 1
- **Then** coach 1 has the 3 players, and the second coach has no player and no class from the run
test: `backend/padel_app/tests/test_pad827_onboarding_runner.py` › `test_another_coach_with_the_same_club_is_not_touched`

#### Fixture of the history criteria (invented names)
Coach 1 "Rui Coach", club 1 "Clube Teste", 5 players and 2 weekly classes loaded by a roster run:
"Segunda 18:00" (Monday 18:00 to 19:00, starts 2026-11-09; Ana Exemplo, Rui Ficticio) and "Quinta
19:00" (Thursday 19:00 to 20:30, starts 2026-11-12; Lia Inventada, Teo Imaginario); Eva Teste is on
the roster in no class. No instance exists. History file `2026_11_19_rui_history`: `from`
2026-08-31, `through` 2026-11-13, `expects` `{players: 5, classes: 2, instances: 0, coach_marks: 0}`.

#### IMPORT-ONBOARDING-RUNNER-21: Every row is resolved and every problem is listed (rules 16, 17)
- **Given** the fixture and a history file with: an absence for "Eva Teste" (in no class) on a
  Tuesday, when the coach has no Tuesday class; an absence
  for Lia Inventada on a Monday; an absence for Ana Exemplo of 90 minutes; a guest row at Monday
  17:00 (no such class); a guest row for Rui Ficticio at Monday 18:00 (enrolled there); an absence
  dated 2026-12-01 (after `through`); a note of 1001 characters (the presence note holds 1000, `attendance.presence` rule 11)
- **When** the operator applies it with `--dry-run`
- **Then** every one of those seven problems is printed with its position and reason, exit code 1,
  and nothing was written

#### IMPORT-ONBOARDING-RUNNER-22: A class the student could not be told from is refused (rule 17a)
- **Given** the fixture, and Teo Imaginario also on a second Thursday class of the same length
- **When** an absence for Teo on a Thursday is dry-run
- **Then** the row is refused as ambiguous, naming both classes, exit code 1

#### IMPORT-ONBOARDING-RUNNER-23: A dry run shows the plan and the expected-vs-file table, and writes nothing (rule 18)
- **Given** the fixture and a valid file ("the valid file" below): Ana Exemplo two justified Monday
  absences (2026-09-07, 2026-09-14, 60 minutes) and one guest row at Thursday 19:00 (2026-09-10,
  90); Lia Inventada one `coach` absence (Thursday 2026-09-03, 90) and two guest rows at Monday
  18:00 (60 each); Teo Imaginario one unjustified Thursday absence (90); Eva Teste one adjustment of
  420 minutes with `lesson_minutes` 60, date 2026-08-31; and `sheet_totals` for each student
- **When** the operator runs `--dry-run`
- **Then** the output names each class's start now and after the move (2026-08-31 and 2026-09-03),
  its occurrence count, and a line per student with justified, unjustified, guest, balance and
  classes owed from the file, beside the sheet's totals with ✓ or the difference
- **And** the exit code is 0 and no Lesson, LessonInstance, Presence or BulkImport row was created

#### IMPORT-ONBOARDING-RUNNER-24: The series start moves back and the past occurrences exist (rules 19, 20)
- **Given** the fixture and the valid file, applied
- **Then** "Segunda 18:00" starts Monday 2026-08-31 18:00 and "Quinta 19:00" Thursday 2026-09-03
  19:00, each still weekly to its former `until`, no new lesson row for them
- **And** every Monday from 2026-08-31 to 2026-11-09 and every Thursday from 2026-09-03 to
  2026-11-12 (the last before `through`) has a lesson instance, once
- **And** the instances of the days the file does not name exist too

#### IMPORT-ONBOARDING-RUNNER-25: The file's marks are written, everyone else is present, nothing is pending (rules 21, D9)
- **Given** the same apply, with Ana Exemplo's absence on Monday 2026-09-07 noted "Lesão"
- **Then** on that Monday Ana's row is absent, justified, validated, `recorded_by` `import`, with
  note "Lesão", and Rui Ficticio's row is present and validated
- **And** Lia Inventada's guest rows are present, validated rows on the Monday occurrences, with
  enrolment source `import`, and she is still on no Monday roster
- **And** the `coach` absence is an absent, justified row
- **And** no instance of the coach has a row with `validated` false

#### IMPORT-ONBOARDING-RUNNER-26: Adjustments are one-off lessons of the right length (rule 23)
- **Given** the same apply, Eva Teste's adjustment of 420 minutes, `lesson_minutes` 60, date 2026-08-31
- **Then** the coach has 7 non-weekly lessons "Ajuste manual (histórico)" on 2026-08-31, one hour
  each, 09:00 to 16:00 in turn, each with Eva Teste only and one absent, justified, validated row
- **And** an adjustment of 420 minutes for Teo Imaginario with no `lesson_minutes` (his class is 90
  minutes) is refused in the dry run: 420 does not divide by 90, exit code 1

#### IMPORT-ONBOARDING-RUNNER-27: No student is contacted and nothing is opened (rule 22)
- **Given** the same apply
- **Then** no email, push or notification event was written, no reminder job exists for the new
  instances, no vacancy, invitation, waiting-list entry or invitation-engine session row was
  created, and `notifications_enabled` of the two classes is as before

#### IMPORT-ONBOARDING-RUNNER-28: A coach-made mark is never overwritten (rules 20, 21, D11)
- **Given** the fixture, and the coach marked Ana Exemplo present on Monday 2026-11-09 (`recorded_by`
  `coach`); the file's `expects.coach_marks` is 1
- **When** the file is applied
- **Then** "Segunda 18:00" has instances from 2026-08-31 to 2026-11-02 and none at or after 2026-11-09
  from the run; the coach's row of 2026-11-09 is as the coach left it
- **And** a file row on or after 2026-11-09 for that class is refused in the dry run naming the
  cut-off, exit code 1

#### IMPORT-ONBOARDING-RUNNER-29: The app's numbers are proven against the file (rule 26)
- **Given** the fixture and the valid file of IMPORT-ONBOARDING-RUNNER-23, applied
- **Then** over 2026-08-31..2026-11-13 the Presences tab's numbers are: Ana Exemplo 2 justified
  (120 min), 0 unjustified, 1 guest presence (90 min), balance -30 minutes, classes owed 1; Lia
  Inventada 1 justified (90), 2 guests (120), balance +30, owed 0; Teo Imaginario 0 justified, 1
  unjustified, balance 0, owed 0; Eva Teste 7 justified (420), balance -420, owed 7
  (`attendance.stats` rule 3 as amended by D2: a validated guest presence is a make-up taken)
- **And** the table is printed again with "file / app" and ✓ on every cell
- **And** when one number differs (a guest row made a regular presence), the run fails as in
  criterion 14, leaving nothing

#### IMPORT-ONBOARDING-RUNNER-30: A second history run and a changed starting state are refused (rule 25)
- **Given** the history run applied; or the coach with 3 instances and a file saying `instances: 0`
- **When** another history file is applied; or that file
- **Then** each is refused naming the active run, or both counts, exit code 1, nothing written

#### IMPORT-ONBOARDING-RUNNER-31: Revert puts everything back (rule 27)
- **Given** the history run applied, and Eva Teste's one-off lessons among its records
- **When** the operator runs `flask onboarding revert 2026_11_19_rui_history --database <name>`
- **Then** the instances, presences, adjustment lessons and their enrolments of the run are gone
- **And** "Segunda 18:00" starts 2026-11-09 and "Quinta 19:00" 2026-11-12 again, as before the run
- **And** the 5 players and 2 classes of the roster run, and the coach's own marks, are as they were
- **And** the BulkImport row is `reverted` and applying the file again is refused (rule 4c)

#### IMPORT-ONBOARDING-RUNNER-32: A revert that would lose the coach's work is refused (rule 27)
- **Given** the history run applied and then the coach changed Ana Exemplo's row on 2026-09-07 (`recorded_by`
  `coach`), or edited the series' start
- **When** the operator reverts the run
- **Then** the revert is refused naming the row or the class, exit code 1, nothing changed
- **And** reverting the roster run while the history run is active is refused naming it

#### IMPORT-ONBOARDING-RUNNER-33: The run creates the missing season and records it (rule 28)
- **Given** the fixture's coach has no season, and the valid file has `season`
  `{start_date: "2026-08-31", end_date: "2027-07-31", label: "2026/2027"}`
- **When** the file is applied
- **Then** the coach has one season, 31 August to 31 July, labelled "2026/2027", and the dry run
  named it as "to be created"
- **And** the BulkImport row's `record_ids.coach_seasons` holds its id and `summary.Seasons` is 1

#### IMPORT-ONBOARDING-RUNNER-34: A coach with a season refuses the run (rule 28)
- **Given** the fixture's coach already has a season 1 September to 30 June, and the valid file has `season`
- **When** the operator applies it, or runs it with `--dry-run`
- **Then** the run is refused naming the coach's season, exit code 1, and nothing is written; the
  season is unchanged
- **And** the same holds when the coach's season is 1 January to 31 March (no overlap): there is
  one season per coach

#### IMPORT-ONBOARDING-RUNNER-35: Revert deletes the season the run created, and only that one (rules 27, 28)
- **Given** the history run of criterion 33 applied
- **When** it is reverted
- **Then** the coach has no season
- **And** when the coach had changed that season's definition in settings before the revert, the
  revert is refused naming it, exit code 1, nothing changed
- **And** a history file with no `season` leaves the coach's season (or lack of one) as it is, in
  apply and in revert

#### IMPORT-ONBOARDING-RUNNER-36: An excluded row is shown, never written, and the proof ignores it (rules 26, 29)
- **Given** the fixture and the valid file of criterion 23, plus in `excluded`: `{source_row: 40,
  student: "Ana Exemplo", kind: "absence", type: "justified", minutes: 60, reason: "no class that
  weekday"}`, and `sheet_totals` for Ana Exemplo of 3 justified absences (180 minutes)
- **When** the operator runs `--dry-run`, then applies the file
- **Then** the dry run lists the excluded row with its reason, and Ana Exemplo's line shows justified
  120 minutes loaded, 60 excluded and the sheet's 180, so the gap of 0 is explained
- **And** after the apply no presence exists for that row, the Presences tab shows Ana Exemplo with
  2 justified absences, rule 26's proof passes, and the final table prints the excluded row again
- **And** a file that lists source row 40 both as loaded and as excluded, or an excluded row with no
  reason, is refused by the file's check, exit code 1, the coach never looked up

#### IMPORT-ONBOARDING-RUNNER-37: A row moved by the operator prints both dates (rule 29)
- **Given** the fixture and a valid file whose absence for Teo Imaginario has `date` 2026-09-10 and
  `sheet_date` 2026-09-09 (a Thursday written as a Wednesday)
- **When** the operator runs `--dry-run`, then applies the file
- **Then** the dry run prints the row with both dates, and the absence is written on
  2026-09-10, in the Thursday class
- **And** a `sheet_date` that is not a real date is refused by the file's check, exit code 1

#### IMPORT-ONBOARDING-RUNNER-38: A student the run creates is in no class and their rows land on the coach's classes (rules 17, 30)
- **Given** the fixture and a history file whose `players` lists "Gil Novo" and "Ines Nova", with
  `expects.players` 5, and rows: a guest for Gil at Monday 18:00 (60 minutes), a guest for Gil at
  Thursday 19:00 (90), an absence for Ines on a Thursday of 90 minutes (the coach's only Thursday class
  of that length is "Quinta 19:00"), an absence for Ines of 60 minutes on a Monday
- **When** the operator runs `--dry-run`, then applies the file
- **Then** the dry run prints "2 players to be created" and a line for each in the table
- **And** after the apply the coach has 7 players, Gil and Ines each a new user with no email and a
  `pending-…` username, on no class's roster
- **And** Gil's guest rows are present rows on the Monday and Thursday occurrences, Ines's
  Thursday absence is an absent row, with the justification of its type, on "Quinta 19:00", and her
  Monday absence one on "Segunda 18:00"
- **And** the BulkImport row records their user, player and coach-player ids and `summary.Players` is 2
- **And** a name of the file's `players` already on the coach's roster is refused naming it, exit code 1

#### IMPORT-ONBOARDING-RUNNER-39: An absence of a student in no class names its class, or is refused (rule 17a)
- **Given** the fixture, Eva Teste on the roster in no class, and two Thursday classes of 90 minutes
  ("Quinta 19:00" and "Quinta 21:00")
- **When** an absence for Eva on a Thursday of 90 minutes with no `start_time` is dry-run
- **Then** the row is refused as ambiguous, naming both classes, exit code 1
- **And** with `start_time` "21:00" it resolves to "Quinta 21:00"; with `start_time` "20:00" it is
  refused (no class starts then)
- **And** an absence of 90 minutes on a day when the only class is 60 minutes is refused for its length

#### IMPORT-ONBOARDING-RUNNER-40: A revert that would delete a row the run did not write is refused (rule 27)
- **Given** the history run applied, and then the coach adds a walk-in to the run's occurrence of
  Monday 2026-09-14 (a new presence, `recorded_by` `coach`)
- **When** the operator reverts the run
- **Then** the revert is refused naming that occurrence and the row, exit code 1, nothing changed
- **And** the same holds for a row the coach added to one of the run's adjustment lessons, and a
  row added by anyone, whatever its `recorded_by`

#### IMPORT-ONBOARDING-RUNNER-41: A coach with a class that follows the season end refuses a season (rule 28)
- **Given** the fixture's coach has a class with `recurs_until_season_end` and no season, and the valid
  file has `season`
- **When** the operator applies it, or runs it with `--dry-run`
- **Then** the run is refused naming that class, exit code 1, nothing written
- **And** the same file with no `season` is accepted

#### IMPORT-ONBOARDING-RUNNER-42: A row validated before `recorded_by` existed is the coach's (rules 20, 25)
- **Given** the fixture, and a presence on Monday 2026-11-09 that is `validated` with no `recorded_by`
  (a row from before the column), `expects.coach_marks` 1
- **When** the file is applied
- **Then** that Monday is the class's cut-off (no run occurrence on or after it) and the row is as it
  was
- **And** with `expects.coach_marks` 0 the run is refused naming both counts

#### IMPORT-ONBOARDING-RUNNER-43: A failure removes an occurrence whose id was not yet recorded, and a revert restores the recurrence rule (rules 26, 27)
- **Given** the fixture, and the apply failing after an occurrence was materialised and before its id was
  recorded
- **Then** no occurrence of that run remains, the history row is gone, and the same file applies afterwards
- **And** after a completed run is reverted, each moved class has its start, end and recurrence rule
  text as before the run

### Notes
- Reused, not reimplemented: player creation is `import.confirm`'s, class creation is
  `classes.create`'s service, deletion is `import.revert`'s. `bulk_create_lessons` is not used: it
  writes no recurrence rule and cannot switch notifications off.
- A run interrupted from outside (the process killed) leaves its `active` row with what was created
  so far; `revert` removes it and the id is then spent.
- The history row is the record of what ran; `_onboarding.sha256` ties it to the file that was
  kept.
- **Rehearsing on the staging copy.** `delivery.staging-data-sync` rewrites every user's name, so
  on that copy the coach is `Coach <user id>` and rule 4a refuses the file as written. The
  rehearsal runs the same file with `coach.name` set to that scrubbed name; ids, club name and
  every other guard are unchanged. The scrub also renames `bulk_imports.filename`, so a production
  run is not listed on a later staging copy.
- **The command starts no scheduler.** `init_scheduler` skips every Flask CLI process except
  `flask run` (PAD-264), so a run never competes for scheduler leadership. Its classes get no
  reminder jobs at creation; the daily window pass derives them (`notifications.reminders` rule
  10c), and with notifications off nothing would be sent anyway.
- Tests use invented names only.
- OPEN (owner): where onboarding files are kept, given the repository is public.
- **History runs: decisions taken in this draft, for review.** (1) A history run is its own file
  and its own `BulkImport` row, applied after the roster run; it creates no players or classes.
  (2) `through` is a field of the file, because the source's last row is not the day it was
  read; occurrences on or after the club's local today are never written (rule 20). (3) A guest row
  for a student who is on that class's roster today is refused, not guessed (the source cannot
  tell a September guest from a November member); the operator decides per row. (4) An absence or
  guest row whose length differs from the class's is refused, not "fixed": the app sums the
  occurrence's own length, so a mismatch would break the hours balance. (5) Revert is refused
  when the coach has since marked a row the run wrote (rule 27): losing the coach's work is
  worse than an operator waiting. (6) The note on an absence is stored verbatim; for a `coach`
  row with no observation the builder of the file writes "Professor" there.
- **History runs: depends on other changes of the stream.** The presence note column (D4,
  `attendance.presence`); `attendance.stats` rule 3 as amended by D2 (classes owed, rule 26 and
  criterion 29); instance creation, `enrol` and the marking path must be callable without the
  engine adoption, the waiting-list fan-out and the engine call (rule 22).
