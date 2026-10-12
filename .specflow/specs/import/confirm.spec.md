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

5. **Adults only on a roster (PAD-642; `players.create` rule 10).** Confirming an import that creates
   players carries `confirmsAdults: true`: before the final confirm the coach ticks "Confirmo que todos
   os alunos importados têm 18 anos ou mais" / "I confirm every imported student is 18 or older". A
   request that declares `adult-roster-confirmation` and does not send it is 400 `{field:
   "confirmsAdults", code: "ADULTS_CONFIRMATION_REQUIRED"}` before anything is imported (the streamed
   confirm refuses the same way, before its first event). An import with no Players rows needs no
   confirmation. Web only: iOS cannot upload an import.

### Acceptance Criteria

#### Confirm import
- **Given** a previewed import with 5 players and 2 classes selected
- **When** coach confirms import
- **Then** all records are created in the database
- **And** a BulkImport record tracks the operation

#### Importing players needs the adults confirmation (rule 5, PAD-642)
- **Given** a client declaring `adult-roster-confirmation` and a confirm payload with Players rows
- **When** it is sent without `confirmsAdults: true`
- **Then** the answer is 400 `ADULTS_CONFIRMATION_REQUIRED` and no row of any table is imported
- **And** with `confirmsAdults: true` the import runs as before
- **And** a payload with no Players rows imports without it
