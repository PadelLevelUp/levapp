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

### Entities
- **READS:** Coach, User, Club, CoachLevel, CoachSeason, BulkImport
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
      (an end of `00:00` is midnight at the end of the day, `classes.create` rule 8c). A weekly
      class has `until`; an `until` date is not before `date`.
   f. `side`, when given, is `left`, `right` or `both`; `type` is `academy` or `private`.
   g. **No age confirmation is asked (owner decision, 2026-11-05).** An onboarding creates roster
      players whose account is a placeholder with no login. The coach's "18 or older" tick
      (`import.confirm` rule 9, `players.create` rule 10) belongs to the coach's own actions in the
      app, and a student's birth date is judged when they activate an account (`auth.activate`).
      The file has no such field; one that carries it is not refused for it.
   h. No value is longer than its column: a player's name and email 120 characters, phone 20; a
      class title 255. A longer value would otherwise fail part-way through the run.
   i. The file has at least one player or one class.
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
