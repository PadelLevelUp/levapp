---
id: import.preview
status: implemented
depends_on: [import.analyze]
implements: ../../specs-business/import/coach-relies-on-import.business.md
governed_by: []
---

# import.preview


### Intent
Preview the import results before confirming, allowing coaches to select which rows to import.

### Rules
1. Tables returned from analysis are displayed in a preview UI
2. Each table has: name, columns, rows with checkboxes
3. Coach can select/deselect individual rows
4. `allSelected` flag for quick toggle
