---
id: import.revert
status: implemented
depends_on: [import.confirm]
serves: [P-IMPORT-1]
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
5. An import that created lesson instances (the onboarding runner's history run,
   `import.onboarding-runner` rule 24) lists them in `record_ids` under `lesson_instances`; revert
   deletes the presences first, then the instances, then the lessons. An instance outside the list is
   never deleted.

### Acceptance Criteria

#### IMPORT-REVERT-1: Revert import
- **Given** an active BulkImport with record_ids `{"users": [10, 11], "players": [5, 6]}`
- **When** coach POSTs to revert
- **Then** users 10, 11 and players 5, 6 are deleted
- **And** the BulkImport status becomes "reverted"

#### IMPORT-REVERT-2: Revert deletes recorded lesson instances (rule 5)
- **Given** an active BulkImport with record_ids `{"lesson_instances": [31, 32], "presences": [70, 71]}`,
  where instance 31 holds presence 70 and instance 32 holds 71, and a third instance 33 of the same
  lesson holds presence 72 that the import did not record
- **When** coach POSTs to revert
- **Then** presences 70, 71 and instances 31, 32 are deleted
- **And** instance 33 and presence 72 are still there
- **And** the BulkImport status becomes "reverted"
