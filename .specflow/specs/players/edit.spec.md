---
id: players.edit
status: implemented
depends_on: [players.create]
implements: ../../specs-business/players/coach-edits-player-details.business.md
governed_by: []
---

# players.edit


### Intent
Coaches update player information, including level, side preference, and personal details.

### Rules
1. Coach can update: name, email, phone, level_id, side. The `side` accepts `left`, `right`, or `both`.
2. Level changes create a PlayerLevelHistory entry (audit trail)
3. Only the associated coach can edit their players

### Acceptance Criteria

#### Edit player level
- **Given** a player with id 3 associated with the authenticated coach
- **When** they PATCH to `/api/app/player/3` with `{"level_id": 2, "side": "left"}`
- **Then** the `coach_in_player` record is updated with the new level and side
- **And** a `player_level_history` entry is created with the new level

#### Set player side to "Both"
- **Given** a player with id 3 associated with the authenticated coach
- **When** they PATCH to `/api/app/player/3` with `{"side": "both"}`
- **Then** the `coach_in_player` record persists `side = "both"`
- **And** the player profile displays the side as "Both"

#### Edit player personal info
- **Given** a player with id 3
- **When** they PATCH to `/api/app/player/3` with `{"name": "John Updated", "phone": "+351912345678"}`
- **Then** the User record is updated with the new name and phone
