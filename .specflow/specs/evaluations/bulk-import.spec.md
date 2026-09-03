---
id: evaluations.bulk-import
status: implemented
depends_on: [evaluations.entries, import.confirm]
implements: ../../specs-business/evaluations/coach-relies-on-evaluations.business.md
governed_by: []
---

# evaluations.bulk-import


### Intent
Bulk import evaluation entries as part of the data import flow.

### Rules
1. `bulk_create_evaluation_entries()` processes imported evaluation data
2. Creates entries linked to coach_player_id and category_id
3. Part of the broader bulk import system
