---
id: import.revert
status: implemented
depends_on: [import.confirm]
implements: ../../specs-business/import/coach-imports-a-roster-spreadsheet.business.md
governed_by: []
---

# import.revert


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
