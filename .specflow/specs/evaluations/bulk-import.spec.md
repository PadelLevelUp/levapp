---
id: evaluations.bulk-import
status: implemented
depends_on: [evaluations.entries, import.confirm]
implements: ../../specs-business/evaluations/coach-evaluates-a-player.business.md
governed_by: []
---

# evaluations.bulk-import


### Intent
Bulk import evaluation entries as part of the data import flow.

### Rules
1. `bulk_create_evaluation_entries()` processes imported evaluation data
2. Creates entries linked to coach_player_id and category_id
3. Part of the broader bulk import system

### Acceptance Criteria — the contract as shipped, pinned by PAD-362

Appended by PAD-362 (2026-09-21); same terms as the section of the same name in
`evaluations.entries`. Tests: `backend/padel_app/tests/test_pad362_evaluation_contract.py`.

#### Wide rows write one entry per category column
- **Given** rows `{player_name, date, Forehand: 6, Volley: "7.5"}` and `{…, Forehand: 8, Volley: ""}`
- **When** `bulk_create_evaluation_entries` runs
- **Then** three entries exist, `imported` is 2 (rows that wrote something), a blank cell is skipped, and each `evaluated_at` is midnight of the row's `date`

#### Normalized rows write one entry per row
- **Given** rows `{player_name, date, category_name, score}`
- **Then** each row writes exactly one entry

#### Players match by display name, categories by exact name
- **Given** a row naming the player by username, one naming the category in another case, and one with a non-numeric score
- **Then** nothing is written and the errors are `Player not found`, `Category not found` and `Invalid score`, each with its row index

#### Reverting an import deletes what it created and nothing else
- **Given** a hand-entered Forehand score and an import that wrote one Forehand and one Volley score
- **When** the import is reverted
- **Then** the answer is `{"deleted": {"evaluation_entries": 2}, "status": "reverted"}` and the hand-entered score remains

#### An imported category keeps a 0 minimum only as a string (B-136 — today's behaviour)
- **Given** category rows with `scale_min: "0"`, `scale_min: 0`, no minimum, and the name of an existing category
- **Then** they are listed as 0, 1 and 1, and the existing category's scale is unchanged
