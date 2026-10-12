---
id: import.confirm
status: implemented
depends_on: [import.preview]
implements: ../../specs-business/import/coach-imports-a-roster-spreadsheet.business.md
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

### Acceptance Criteria

#### Confirm import
- **Given** a previewed import with 5 players and 2 classes selected
- **When** coach confirms import
- **Then** all records are created in the database
- **And** a BulkImport record tracks the operation

#### A row without an email stores no email (PAD-633)
- **Given** a coach importing a Players row `{"name": "João Silva"}` with no email
- **When** the coach confirms the import
- **Then** a new User is created with `email` NULL and a `pending-…` placeholder username
- **And** no User with an `@email.com` address exists afterwards

#### A row without an email never joins another coach's player (PAD-633)
- **Given** coach A has already imported "João Silva" without an email
- **When** coach B imports a row "João Silva" without an email
- **Then** coach B gets a new player of their own
- **And** coach A's player gains no link to coach B

#### A row with an email still reuses that account (PAD-633)
- **Given** a User with email `ana@example.com` exists and is not on the coach's roster
- **When** the coach imports a row with email `ANA@example.com`
- **Then** no new User is created and only the coach link is added
- **And** importing the same row again creates nothing

#### Invented addresses are removed from existing rows (PAD-633)
- **Given** an inactive, password-less User with email `joao_silva@email.com` and username `joao_silva`
- **And** an inactive User with a coach-typed email `rita@email.com` and a `pending-…` username
- **When** the PAD-633 migration runs
- **Then** the first has `email` NULL and a `pending-…` username, and keeps its id and roster link
- **And** the second is unchanged
- **And** an inactive User `rui_lopes@email.com` / `rui_lopes` whose password is the hash of ""
  ends with `email`, `password` NULL and a `pending-…` username
- **And** an inactive User in the same shape with a password someone chose is unchanged, and the
  migration reports it as skipped
