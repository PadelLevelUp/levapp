---
id: levels.player-assignment
status: implemented
depends_on: [levels.coach-levels, players.create]
implements: ../../specs-business/levels/coach-defines-and-assigns-skill-ladder.business.md
governed_by: []
---

# levels.player-assignment


### Intent
Assign a skill level to a player within a coach-player relationship. Level assignments are tracked in history.

### Rules
1. The current level is `coach_in_player.level_id`, a cache of the history (players.level-history rule 2)
2. Level changes create `player_level_history` entries, through the one writer `set_roster_level`
   (players.level-history rule 1)
3. The history is the record of assignments, newest first by `assigned_at`; there is no `player.level`
   (retired in PAD-270)
4. Same player can have different levels from different coaches
5. Notification engine uses levels for matching (same-level preference)

### Acceptance Criteria

#### Assign level to player
- **Given** a player without a level assignment
- **When** coach sets level to "Intermediate" (id=2)
- **Then** `coach_in_player.level_id` is set to 2
- **And** a `player_level_history` entry is created

#### Level history ordering
- **Given** a player with level history Beginner (Jan), Intermediate (Mar), set through the one writer
- **When** the coach reads the roster
- **Then** the player's `levelId` is "Intermediate", and so is the latest history entry by `assigned_at`

### Notes
- A class's level resolves through one helper, `effective_level_id` (`services/level_service.py`):
  the occurrence's own level, else its lesson's default (PAD-86). The notification engine and the
  calendar serializer both use it (PAD-270).
