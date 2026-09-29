---
id: clubs.coach-invitation
status: implemented
depends_on: [clubs.crud, clubs.membership, auth.activate]
implements: ../../specs-business/clubs/coach-runs-a-club-and-its-team.business.md
governed_by: []
---

# clubs.coach-invitation


### Intent
A coach who belongs to a club can invite another coach to join that club via a shareable invite link. Accepting the invitation creates (or links) the coach account and adds them to the club.

### Entities
- **CoachInvitation** (`coach_invitations`): club_id (FK → clubs, CASCADE), token_hash (unique; the SHA-256 hex of the token, which is never stored, PAD-269), email (optional), invited_by_coach_id (FK → coaches, SET NULL — PAD-255), status (pending|accepted|revoked|expired), expires_at, created_at

### Rules
1. Only a coach with a `coach_in_club` association for the club can create or revoke invitations for it
2. Each invitation has a unique single-use token, expiring after 7 days. Only its SHA-256 hash is stored (PAD-269); the token appears once, in the creation response's `inviteLink`, and links issued before PAD-269 keep working because its migration hashed the stored tokens in place.
3. Frontend route: `/invite/coach/:token` — shows club name and accept form
4. Accepting as a new user: registers a User + Coach with status `active`, then creates the `coach_in_club` association
5. Accepting while authenticated as an existing coach: only creates the `coach_in_club` association (no-op if already a member)
6. Used, revoked, or expired tokens are rejected (410)
7. Inviter can list and revoke pending invitations for their club. `GET /api/app/club/<clubId>/coach-invitations` returns each pending invitation's `id`, `email`, `expiresAt` and `createdAt`, never its token (PAD-269: the list used to hand every coach of the club every live link). Revoking from the list is `POST /api/app/club/<clubId>/coach-invitations/<id>/revoke` (403 for a non-member, 404 for an id outside the club, 410 unless pending). `POST /api/app/coach-invitations/<token>/revoke` still works for whoever holds the link.

8. **A new coach account is adults-only (PAD-457).** The new-user branch of the accept creates a
   login, so it takes `birthDate` and refuses exactly as sign-up does (`auth.register` rule 18, one
   shared check; 400 on `birthDate` with `BIRTH_DATE_REQUIRED`, `INVALID_BIRTH_DATE` or `UNDERAGE`), creating
   nothing on a refusal. The existing-coach branch creates no account and is unchanged. Web and iOS
   add the field.

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

#### The list never carries a token (PAD-269)
- **Given** a pending invitation for club 1 created by a member coach
- **When** another member coach GETs `/api/app/club/1/coach-invitations`
- **Then** the row has `id`, `email`, `expiresAt` and `createdAt`, and no `token`
- **And** the stored row holds only the token's SHA-256 hash

#### Revoke from the list by id (PAD-269)
- **Given** a pending invitation with id 7 for club 1
- **When** a member coach POSTs `/api/app/club/1/coach-invitations/7/revoke`
- **Then** the invitation becomes `revoked` and accepting its link answers 410
- **And** the same call from a coach outside club 1 is 403

#### A club invitation does not create an under-18 coach (PAD-457)
- **Given** a pending coach invitation and no user `teencoach457`, today 2026-09-25 (UTC)
- **When** it is accepted as a new user with `birthDate` `2009-01-01`
- **Then** the response is 400 `UNDERAGE` and no user `teencoach457` exists; with `birthDate` `1990-05-05` the coach is created with that birth date
