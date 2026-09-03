---
id: levels.player-assignment
status: implemented
depends_on: [levels.coach-levels, players.create]
implements: ../../specs-business/levels/coach-relies-on-levels.business.md
governed_by: []
---

# levels.player-assignment


### Intent
Assign a skill level to a player within a coach-player relationship. Level assignments are tracked in history.

### Rules
1. Level stored in `coach_in_player.level_id`
2. Level changes create `player_level_history` entries
3. `player.level` returns latest assignment from history (ordered by assigned_at DESC)
4. Same player can have different levels from different coaches
5. Notification engine uses levels for matching (same-level preference)

### Acceptance Criteria

#### Assign level to player
- **Given** a player without a level assignment
- **When** coach sets level to "Intermediate" (id=2)
- **Then** `coach_in_player.level_id` is set to 2
- **And** a `player_level_history` entry is created

#### Level history ordering
- **Given** a player with level history: Beginner (Jan), Intermediate (Mar)
- **When** querying `player.level`
- **Then** "Intermediate" is returned (most recent by assigned_at)
