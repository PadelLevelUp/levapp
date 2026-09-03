---
id: evaluations.player-view
status: implemented
depends_on: [evaluations.entries]
implements: ../../specs-business/evaluations/coach-relies-on-evaluations.business.md
governed_by: []
---

# evaluations.player-view


### Intent
Display evaluation history and current scores on the player detail page, with chart visualization.

### Rules
1. Player profile page shows current scores per category
2. Frontend renders evaluation history as a chart (Recharts)
3. Scores shown with category name, scale, and latest value
4. Coach can add new evaluations from the player detail page
