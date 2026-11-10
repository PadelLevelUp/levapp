---
id: evaluations.bulk-import
status: implemented
depends_on: [evaluations.entries, import.confirm]
serves: [P-EVALUATIONS-1]
governed_by: []
---

# evaluations.bulk-import


### Intent
Bulk import evaluation entries as part of the data import flow.

### Rules
1. `bulk_create_evaluation_entries()` processes imported evaluation data
2. Creates entries linked to coach_player_id and category_id
   - 2a. It runs inside the import confirm step, after the "Evaluation Categories" table:
     `bulk_create_evaluation_categories()` finds or creates by `(coach, name)` and never updates
     an existing category's scale.
   - 2b. Two row shapes: wide (`player_name, date, <category>: score, …`) and normalized
     (`player_name, date, category_name, score`). The player is matched by display name, the
     category by exact name.
   - 2c. The score is read with `float()` and must lie in 1–5 (`evaluations.legacy-conversion`
     rule 9: a row outside it is refused with `score_out_of_range`), and `date` is written to
     `evaluated_at` (midnight) — the only path in the product that writes a past evaluation date.
   - 2d. `comment` is never written. Nothing on the row marks it as imported; the import's own
     record of what it created is what revert deletes.
   - 2e. An imported category is created at 1–5 whatever the sheet says
     (`evaluations.legacy-conversion` rule 5).
   - 2f. The import flow is web only; iOS shows import history.
   - 2g. Imported rows are grouped into class-less records by player and date through the one
     record writer (`evaluations.records` rule 12); imported categories stay legacy.
3. Part of the broader bulk import system

### Acceptance Criteria: the contract as shipped, pinned by PAD-362

Appended by PAD-362 (2026-09-21); same terms as the section of the same name in
`evaluations.entries`. Tests: `backend/padel_app/tests/test_pad362_evaluation_contract.py`.

#### EVALUATIONS-BULK-IMPORT-1: Wide rows write one entry per category column
- **Given** rows `{player_name, date, Forehand: 6, Volley: "7.5"}` and `{…, Forehand: 8, Volley: ""}`
- **When** `bulk_create_evaluation_entries` runs
- **Then** three entries exist, `imported` is 2 (rows that wrote something), a blank cell is skipped, and each `evaluated_at` is midnight of the row's `date`

#### EVALUATIONS-BULK-IMPORT-2: Normalized rows write one entry per row
- **Given** rows `{player_name, date, category_name, score}`
- **Then** each row writes exactly one entry

#### EVALUATIONS-BULK-IMPORT-3: Players match by display name, categories by exact name
- **Given** a row naming the player by username, one naming the category in another case, and one with a non-numeric score
- **Then** nothing is written and the errors are `Player not found`, `Category not found` and `Invalid score`, each with its row index

#### EVALUATIONS-BULK-IMPORT-4: Reverting an import deletes what it created and nothing else
- **Given** a hand-entered Forehand score and an import that wrote one Forehand and one Volley score
- **When** the import is reverted
- **Then** the answer is `{"deleted": {"evaluation_entries": 2}, "status": "reverted"}` and the hand-entered score remains
