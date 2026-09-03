---
id: clubs.crud
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/clubs/coach-relies-on-clubs.business.md
governed_by: []
---

# clubs.crud


### Intent
Coaches create and manage clubs that serve as the organizational container for lessons, players, and other coaches.

### Entities
- **Club** (`clubs`): name (required), description, location, logo_id (FK → images)
- **Association_CoachClub** (`coach_in_club`): coach_id, club_id (unique pair)
- **Association_PlayerClub** (`player_in_club`): player_id, club_id (unique pair)

### Rules
1. A coach can belong to multiple clubs (M:N via `coach_in_club`)
2. A player can belong to multiple clubs (M:N via `player_in_club`)
3. `coach.current_club` returns the most recently joined club (ordered by `created_at DESC`)
4. Club logo stored as an Image record in GCS
5. Lessons are scoped to a club (`lessons.club_id` FK with CASCADE delete)

### Acceptance Criteria

#### Create club
- **Given** an authenticated coach
- **When** they POST to `/api/app/club` with `{"name": "Padel Academy", "location": "Lisbon"}`
- **Then** a Club record is created
- **And** a `coach_in_club` association is created linking the coach

#### Edit club
- **Given** a club with id 1 owned by the authenticated coach
- **When** they PATCH to `/api/app/club/1` with `{"name": "Updated Academy"}`
- **Then** the club name is updated
