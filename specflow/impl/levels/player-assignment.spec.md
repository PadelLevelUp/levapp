---
id: levels.player-assignment
status: implemented
depends_on: [levels.coach-levels, players.create]
serves: [P-LEVELS-1]
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
6. **A class has one level, resolved one way** (PAD-86, PAD-270). It is the occurrence's own level,
   else its lesson's default level, else none. The notification engine and the calendar both read it
   through `effective_level_id` (`services/level_service.py`); "none" means nobody qualifies by
   level, never that the level filter is off.

### Acceptance Criteria

#### LEVELS-PLAYER-ASSIGNMENT-1: Assign level to player
- **Given** a player without a level assignment
- **When** coach sets level to "Intermediate" (id=2)
- **Then** `coach_in_player.level_id` is set to 2
- **And** a `player_level_history` entry is created

#### LEVELS-PLAYER-ASSIGNMENT-2: Level history ordering
- **Given** a player with level history Beginner (Jan), Intermediate (Mar), set through the one writer
- **When** the coach reads the roster
- **Then** the player's `levelId` is "Intermediate", and so is the latest history entry by `assigned_at`

#### LEVELS-PLAYER-ASSIGNMENT-3: A class's level is its occurrence's own, else its lesson's default, else none (rule 6)
- **Given** a lesson whose default level is `B`
- **When** the level of one of its occurrences is resolved
- **Then** it is the occurrence's own level when it has one, and `B` when it has none
- **And** a lesson is resolved to its default level, and a class with no level anywhere to none
test: `backend/padel_app/tests/test_effective_level_resolution.py` › `test_instance_level_wins` (+3 more)
