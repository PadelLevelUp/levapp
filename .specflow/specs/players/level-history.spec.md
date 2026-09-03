---
id: players.level-history
status: implemented
depends_on: [players.create, levels.coach-levels]
implements: ../../specs-business/players/coach-relies-on-players.business.md
governed_by: []
---

# players.level-history


### Intent
Track the history of level assignments for a player, providing an audit trail.

### Entities
- **PlayerLevelHistory** (`player_level_history`): player_id, coach_id, level_id, assigned_at

### Rules
1. Every level change creates a new history entry
2. `player.level` returns the most recent entry (ordered by `assigned_at DESC`)
3. History is per-coach — different coaches may assign different levels to the same player

### Acceptance Criteria

#### Level change tracked
- **Given** a player currently at level "Beginner"
- **When** a coach changes their level to "Intermediate"
- **Then** a new `player_level_history` entry is created with the new level
- **And** `player.level` returns "Intermediate"
