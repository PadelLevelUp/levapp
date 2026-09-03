---
id: players.remove
status: implemented
depends_on: [players.create]
implements: ../../specs-business/players/coach-edits-player-details.business.md
governed_by: []
---

# players.remove


### Intent
Remove a player from a coach's roster. Does not delete the user — just removes the coach-player association.

### Rules
1. Removes the `coach_in_player` association
2. Does not delete the User or Player records
3. Player can still be associated with other coaches

### Acceptance Criteria

#### Remove player
- **Given** a player with id 3 associated with the authenticated coach
- **When** they DELETE `/api/app/player/3`
- **Then** the `coach_in_player` association is removed
- **And** the User and Player records still exist
