# import — Bulk Data Import

## import.analyze

---
id: import.analyze
status: implemented
depends_on: [auth.login]
---

### Intent
Upload an Excel file and have an AI analyze its contents, mapping columns to the system's data model.

### Rules
1. `POST /api/app/import/analyze` uploads the file
2. Uses OpenAI API to analyze file structure via `stream_import_analysis()`
3. Response is an SSE stream with events: thinking, phase, progress, tables, error, done
4. AI identifies tables: Players, Classes, Associations, Evaluation Entries, Coach Notes
5. Frontend renders progressive analysis with streaming UI

### Acceptance Criteria

#### Analyze Excel file
- **Given** an uploaded Excel file with player data
- **When** coach POSTs to `/api/app/import/analyze`
- **Then** an SSE stream begins with analysis events
- **And** eventually returns structured `tables` with column mappings and row data

---

## import.preview

---
id: import.preview
status: implemented
depends_on: [import.analyze]
---

### Intent
Preview the import results before confirming, allowing coaches to select which rows to import.

### Rules
1. Tables returned from analysis are displayed in a preview UI
2. Each table has: name, columns, rows with checkboxes
3. Coach can select/deselect individual rows
4. `allSelected` flag for quick toggle

---

## import.confirm

---
id: import.confirm
status: implemented
depends_on: [import.preview]
---

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

---

## import.revert

---
id: import.revert
status: implemented
depends_on: [import.confirm]
---

### Intent
Undo a previously executed import, deleting all records that were created.

### Rules
1. `POST /api/app/import/{id}/revert` reverts the import
2. Deletes all records tracked in `BulkImport.record_ids`
3. Sets `BulkImport.status` to "reverted"
4. `GET /api/app/import/history` shows past imports with revert option

### Acceptance Criteria

#### Revert import
- **Given** an active BulkImport with record_ids `{"users": [10, 11], "players": [5, 6]}`
- **When** coach POSTs to revert
- **Then** users 10, 11 and players 5, 6 are deleted
- **And** the BulkImport status becomes "reverted"
