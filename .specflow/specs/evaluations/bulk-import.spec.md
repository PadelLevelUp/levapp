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
   - 2a. It runs inside the import confirm step, after the "Evaluation Categories" table:
     `bulk_create_evaluation_categories()` finds or creates by `(coach, name)` and never updates
     an existing category's scale.
   - 2b. Two row shapes: wide (`player_name, date, <category>: score, …`) and normalized
     (`player_name, date, category_name, score`). The player is matched by display name, the
     category by exact name.
   - 2c. The score goes through `float()` with no range check (B-126), and `date` is written to
     `evaluated_at` (midnight) — the only path in the product that writes a past evaluation date.
   - 2d. `comment` is never written. Nothing on the row marks it as imported; the import's own
     record of what it created is what revert deletes.
   - 2e. Categories go through the shared form layer: a numeric `0` minimum is stored as 1, only
     the string `"0"` as 0 (B-136).
   - 2f. The import flow is web only; iOS shows import history.
   - 2g. **Superseded by / Planned (not built):** imported rows will be grouped into class-less
     records by player and date through the one record writer, keeping their scale, and imported
     categories stay legacy — `evaluations.records` rule 12 (draft, build default Q22).
3. Part of the broader bulk import system
