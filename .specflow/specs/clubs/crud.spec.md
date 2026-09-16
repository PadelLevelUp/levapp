---
id: clubs.crud
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/clubs/coach-runs-a-club-and-its-team.business.md
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
3. `coach.current_club` returns the most recently joined club: the `coach_in_club` row with the latest
   `created_at`. A membership with no `created_at` (legacy rows; the column is nullable) counts as the
   oldest, and equal join times go to the higher `id`. The answer never depends on how the database
   orders NULLs (PAD-266 / B-036: Postgres sorts them first in a descending order, SQLite last).
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

#### Current club is the most recently joined (PAD-266)
- **Given** a coach who joined club A on 2026-01-01 and club B on 2026-09-01
- **When** the app resolves their current club (every club-scoped route, `GET /api/app/coach`)
- **Then** it is club B, whichever order the memberships were inserted in
- **And** a membership with no join time never outranks one that has one
