---
id: import.confirm
status: implemented
depends_on: [import.preview]
serves: [P-IMPORT-1]
governed_by: []
---

# import.confirm


### Intent
Execute the confirmed import, creating all selected records in the database.

### Entities
- **BulkImport** (`bulk_imports`): coach_id, filename, status (active|reverted), summary (JSON), record_ids (JSON)

### Rules
1. `POST /api/app/import/confirm` with selected tables/rows
2. Bulk creation services called in order:
   - `bulk_create_coach_levels()` → `bulk_create_evaluation_categories()` → `bulk_create_players()` → `bulk_create_lessons()` → `bulk_create_player_lesson_associations()` → `bulk_create_presences()` → `bulk_create_evaluation_entries()` → `bulk_create_coach_notes()`
3. BulkImport record tracks all created record IDs for revert
4. `summary` stores counts: `{"Players": 5, "Classes": 2}`
5. **A Players row without an email creates a player without an email** (PAD-633). The User is
   stored with `email` NULL; no address is ever invented for it. Before PAD-633 the import wrote
   `first_second@email.com` (suffixed `_2`, `_3`… when taken), an address on a real public mail
   domain that could belong to a stranger.
6. **An imported User gets a placeholder username**, as a coach-created player does
   (`players.create` rules 4-5, PAD-105): `pending-<random>`, chosen by the student at activation.
   The import never derives a username from the email or the name.
7. **Identity of a Players row.** A row with an email is matched on that email (case-insensitive):
   an existing User with it is reused and only the missing Player / coach link is created; a coach
   link that already exists makes the row a no-op. A row without an email always creates a new
   player, exactly as the add-player form does without an email; it never matches another
   coach's player. The preview's "Possible duplicate" flag (`players.duplicate-name-check`
   rule 6) is where the coach decides whether a same-name row is a new person.
8. **Existing rows (PAD-633 data migration).** A user is in the import's shape when the email
   ends in `@email.com`, the username equals the address's local part, and the account is
   `inactive`. If such a user never chose a password, the email becomes NULL, the username a
   fresh placeholder, and the password NULL. "Never chose" means the password is NULL, or it is
   the hash of the empty string, which the import wrote before 933d7827c (2026-06-09). A user in
   that shape with any other password is skipped and counted, because a new username would lock
   them out. Nothing else changes: roster links, notes, attendance and activation links stay as
   they were. A coach-typed `@email.com` address carries a placeholder username and is never
   touched.

9. **Adults only on a roster (PAD-642; `players.create` rule 10).** Confirming an import that creates
   players carries `confirmsAdults: true`: before the final confirm the coach ticks "Confirmo que todos
   os alunos importados têm 18 anos ou mais" / "I confirm every imported student is 18 or older". A
   request that declares `adult-roster-confirmation` and does not send it is 400 `{field:
   "confirmsAdults", code: "ADULTS_CONFIRMATION_REQUIRED"}` before anything is imported (the streamed
   confirm refuses the same way, before its first event). An import with no Players rows needs no
   confirmation. Web only: iOS cannot upload an import.
10. **An imported attendance row that says present stores no justification** (PAD-381;
   `attendance.validation` rule 21). An absent row keeps the justification the sheet gave.
11. **A row error is shown in the coach's language when this build knows its code** (D111;
   `evaluations.legacy-conversion` rule 9). An error with a code the build does not know, or with
   no code, is shown with the server's text as sent. Web only: iOS has no uploader.

### Acceptance Criteria

#### IMPORT-CONFIRM-1: Confirm import
- **Given** a previewed import with 5 players and 2 classes selected
- **When** coach confirms import
- **Then** all records are created in the database
- **And** a BulkImport record tracks the operation

#### IMPORT-CONFIRM-2: Importing players needs the adults confirmation (rule 9, PAD-642)
- **Given** a client declaring `adult-roster-confirmation` and a confirm payload with Players rows
- **When** it is sent without `confirmsAdults: true`
- **Then** the answer is 400 `ADULTS_CONFIRMATION_REQUIRED` and no row of any table is imported
- **And** with `confirmsAdults: true` the import runs as before
- **And** a payload with no Players rows imports without it

#### IMPORT-CONFIRM-3: A row without an email stores no email (PAD-633)
- **Given** a coach importing a Players row `{"name": "João Silva"}` with no email
- **When** the coach confirms the import
- **Then** a new User is created with `email` NULL and a `pending-…` placeholder username
- **And** no User with an `@email.com` address exists afterwards

#### IMPORT-CONFIRM-4: A row without an email never joins another coach's player (PAD-633)
- **Given** coach A has already imported "João Silva" without an email
- **When** coach B imports a row "João Silva" without an email
- **Then** coach B gets a new player of their own
- **And** coach A's player gains no link to coach B

#### IMPORT-CONFIRM-5: A row with an email still reuses that account (PAD-633)
- **Given** a User with email `ana@example.com` exists and is not on the coach's roster
- **When** the coach imports a row with email `ANA@example.com`
- **Then** no new User is created and only the coach link is added
- **And** importing the same row again creates nothing

#### IMPORT-CONFIRM-6: Invented addresses are removed from existing rows (PAD-633)
- **Given** an inactive, password-less User with email `joao_silva@email.com` and username `joao_silva`
- **And** an inactive User with a coach-typed email `rita@email.com` and a `pending-…` username
- **When** the PAD-633 migration runs
- **Then** the first has `email` NULL and a `pending-…` username, and keeps its id and roster link
- **And** the second is unchanged
- **And** an inactive User `rui_lopes@email.com` / `rui_lopes` whose password is the hash of ""
  ends with `email`, `password` NULL and a `pending-…` username
- **And** an inactive User in the same shape with a password someone chose is unchanged, and the
  migration reports it as skipped

#### IMPORT-CONFIRM-7: An imported present row carries no justification (rule 10, PAD-381)
- **Given** a sheet row for a class the coach gives, with status `present` and justification `justified`
- **When** the attendance rows are imported
- **Then** the stored row is `present` with no justification
- **And** the same row with status `absent` is stored `absent`, `justified`
test: `backend/padel_app/tests/test_pad381_engine_ignores_stale_justifications.py` › `test_an_imported_present_row_carries_no_justification` (+1 more)

#### IMPORT-CONFIRM-8: Two rows with the same name and no email are two players (rule 7)
- **Given** one file with two Players rows named "Ana Costa", neither with an email
- **When** the coach confirms the import
- **Then** both rows import with no error, and the coach's roster has two players
test: `backend/padel_app/tests/test_pad633_import_invents_no_email.py` › `test_two_rows_with_the_same_name_and_no_email_are_two_players`

#### IMPORT-CONFIRM-9: A row with an email gets a placeholder username too (rule 6)
- **Given** a Players row `{"name": "Ana", "email": "ana.silva@example.com"}` and no user with that email
- **When** the coach confirms the import
- **Then** the new User keeps that email and its username starts with `pending-`
test: `backend/padel_app/tests/test_pad633_import_invents_no_email.py` › `test_a_new_user_with_an_email_also_gets_a_placeholder_username`

#### IMPORT-CONFIRM-10: The PAD-633 migration changes nothing when it runs again or is downgraded (rule 8)
- **Given** a database the PAD-633 migration has repaired
- **When** the upgrade runs a second time, or the downgrade runs
- **Then** every user row is as the first run left it
test: `backend/padel_app/tests/test_pad633_migration.py` › `test_upgrade_twice_is_a_no_op` (+1 more)

#### IMPORT-CONFIRM-11: The web's streamed confirm declares the capability and carries the confirmation (rule 9)
- **Given** the web app confirming an import through the streamed route
- **When** the coach ticked the adults confirmation
- **Then** the request's `X-LevApp-Capabilities` header contains `adult-roster-confirmation` and its body carries `confirmsAdults: true` beside the selected rows
- **And** when the coach gave no confirmation, the body has no `confirmsAdults` key
test: `frontend/apps/web/src/api/import.stream.test.ts` › `declares the shell's capabilities and sends confirmsAdults` (+1 more)

#### IMPORT-CONFIRM-12: A row error this build cannot translate is shown as the server sent it (rule 11)
- **Given** an import answer with a row error whose `code` is `some_future_code`, and another with no `code`
- **When** the web renders the errors
- **Then** each shows the server's `error` text unchanged
test: `frontend/apps/web/src/components/settings/import-row-error.test.ts` › `falls back to the server's text for a code this build does not know` (+1 more)
