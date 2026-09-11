---
id: players.level-history
status: implemented
depends_on: [players.create, levels.coach-levels]
implements: ../../specs-business/players/coach-browses-and-reviews-roster.business.md
governed_by: []
---

# players.level-history


### Intent
Track the history of level assignments for a player, providing an audit trail.

### Entities
- **PlayerLevelHistory** (`player_level_history`): player_id, coach_id, level_id, assigned_at — indexed on (player_id, assigned_at)

### Rules
1. Every level change creates a new history entry. The one writer of a roster level is
   `set_roster_level` (`services/level_service.py`): it sets `coach_in_player.level_id` and, when the
   level differs from the latest entry for that coach and player, adds the history row in the same
   transaction. Create, edit, invitation, import and the claim merge all go through it (PAD-270).
2. History is the record of assignments; `coach_in_player.level_id` is its cache, the current level
   every read uses. There is no `player.level`: it read the history oldest-entry-first and was
   never used, so PAD-270 retired it (B-061).
3. History is per-coach — different coaches may assign different levels to the same player
4. Setting the level a player already has writes no entry. Clearing a level writes no entry, and
   deleting a coach level deletes its entries (levels.coach-levels rule 11).

### Acceptance Criteria

#### Level change tracked
- **Given** a player currently at level "Beginner", with one history entry
- **When** the coach edits them to "Intermediate" (`POST /api/app/edit_player`)
- **Then** a new `player_level_history` entry is created with "Intermediate"
- **And** `coach_in_player.level_id` is "Intermediate", and so is the latest entry by `assigned_at`

#### The same level writes nothing
- **Given** a player at "Beginner"
- **When** the coach saves an edit that keeps "Beginner", or sets "Beginner" again
- **Then** no new history entry is created

#### A borrowed level is recorded
- **Given** a student who claims a placeholder, and the claimant's link to the coach has no level
  while the placeholder's has "Beginner"
- **When** the claim merge keeps the claimant's link and borrows the level
- **Then** the claimant's link is "Beginner" and the latest history entry for that coach is "Beginner"
