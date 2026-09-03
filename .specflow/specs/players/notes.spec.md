---
id: players.notes
status: implemented
depends_on: [players.create]
implements: ../../specs-business/players/coach-browses-and-reviews-roster.business.md
governed_by: []
---

# players.notes


### Intent
Coaches record strengths and weaknesses notes for their players.

### Entities
- **CoachPlayerNote** (`coach_player_notes`): coach_player_id, type (strength|weakness), text, created_at

### Rules
1. Notes are scoped to a coach-player relationship (not global)
2. Type is either `strength` or `weakness`
3. Text max 500 characters
4. `POST /api/app/coach/note` to add, `POST /api/app/delete/coach_note` to remove

### Acceptance Criteria

#### Add strength note
- **Given** a coach-player relationship for player "Alice"
- **When** coach POSTs to `/api/app/coach/note` with `{"player_id": 5, "type": "strength", "text": "Excellent forehand"}`
- **Then** a CoachPlayerNote is created
- **And** it appears in the player's profile under strengths

#### Delete note
- **Given** a strength note with id 10
- **When** coach POSTs to `/api/app/delete/coach_note` with `{"note_id": 10}`
- **Then** the note is deleted
