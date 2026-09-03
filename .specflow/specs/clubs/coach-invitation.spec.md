---
id: clubs.coach-invitation
status: implemented
depends_on: [clubs.crud, clubs.membership, auth.activate]
implements: ../../specs-business/clubs/coach-relies-on-clubs.business.md
governed_by: []
---

# clubs.coach-invitation


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
