# clubs — Club Management

## clubs.crud

---
id: clubs.crud
status: implemented
depends_on: [auth.login]
---

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

---

## clubs.membership

---
id: clubs.membership
status: implemented
depends_on: [clubs.crud]
---

### Intent
Manage which coaches and players belong to a club.

### Rules
1. Players are added to a club when created by a coach in that club
2. Coaches join a club through `coach_in_club` association
3. All lesson, player, and calendar operations are scoped to the coach's current club

### Notes
- Club membership is implicit — there's no explicit "join club" endpoint for players. Players are associated when a coach adds them.
- Coaches can also join a club explicitly via `clubs.coach-invitation`.

---

## clubs.coach-invitation

---
id: clubs.coach-invitation
status: implemented
depends_on: [clubs.crud, clubs.membership, auth.activate]
---

### Intent
A coach who belongs to a club can invite another coach to join that club via a shareable invite link. Accepting the invitation creates (or links) the coach account and adds them to the club.

### Entities
- **CoachInvitation** (`coach_invitations`): club_id (FK → clubs, CASCADE), token (unique), email (optional), invited_by_coach_id (FK → coaches), status (pending|accepted|revoked|expired), expires_at, created_at

### Rules
1. Only a coach with a `coach_in_club` association for the club can create or revoke invitations for it
2. Each invitation has a unique single-use token, expiring after 7 days
3. Frontend route: `/invite/coach/:token` — shows club name and accept form
4. Accepting as a new user: registers a User + Coach with status `active`, then creates the `coach_in_club` association
5. Accepting while authenticated as an existing coach: only creates the `coach_in_club` association (no-op if already a member)
6. Used, revoked, or expired tokens are rejected (410)
7. Inviter can list and revoke pending invitations for their club

### Acceptance Criteria

#### Create invitation
- **Given** an authenticated coach belonging to club 1
- **When** they POST to `/api/app/club/1/coach-invitations`
- **Then** a CoachInvitation is created with status `pending` and a unique token
- **And** the response contains the shareable invite link

#### Non-member cannot invite
- **Given** an authenticated coach NOT belonging to club 1
- **When** they POST to `/api/app/club/1/coach-invitations`
- **Then** the response status is 403

#### Accept as new coach
- **Given** a pending invitation token for club 1
- **When** an unauthenticated visitor POSTs to `/api/app/coach-invitations/<token>/accept` with name, username, password
- **Then** a User + Coach is created with status `active`, joined to club 1, and the invitation becomes `accepted`

#### Accept as existing coach
- **Given** a pending invitation token for club 1 and an authenticated coach not in club 1
- **When** they POST to accept
- **Then** a `coach_in_club` association is created and the invitation becomes `accepted`

#### Expired/used token
- **Given** an invitation that is expired, revoked, or already accepted
- **When** anyone attempts to accept it
- **Then** the response status is 410
