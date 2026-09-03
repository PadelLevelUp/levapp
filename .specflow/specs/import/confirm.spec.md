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

### Acceptance Criteria

#### Confirm import
- **Given** a previewed import with 5 players and 2 classes selected
- **When** coach confirms import
- **Then** all records are created in the database
- **And** a BulkImport record tracks the operation
