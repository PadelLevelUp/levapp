---
id: classes.instance-enrollment
status: implemented
depends_on: [classes.instances, players.create]
implements: ../../specs-business/classes/coach-relies-on-classes.business.md
governed_by: []
---

# classes.instance-enrollment


### Intent
Manage player enrollment at the instance level (per-occurrence), separate from the lesson template enrollment.

### Rules
1. `Association_PlayerLessonInstance` links players to specific instances
2. Used for one-off additions (e.g., substitute players, invitation acceptances)
3. Players added this way get a Presence record for that instance
