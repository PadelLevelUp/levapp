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
4. Accepting as a new user creates a User and Coach (status `active`), the coach's default level ladder, and the `coach_in_club` association, and marks the invitation accepted. **All of this is one transaction (PAD-476, B-246):** a failure at any step leaves no User, Coach, level or club link, the invitation stays pending, and accepting it again succeeds. The first email-verification code (rule 9) is sent only after that transaction has committed, and never when it rolls back.
5. Accepting while authenticated as an existing coach: only creates the `coach_in_club` association (no-op if already a member)
6. Used, revoked, or expired tokens are rejected (410)
7. Inviter can list and revoke pending invitations for their club. `GET /api/app/club/<clubId>/coach-invitations` returns each pending invitation's `id`, `email`, `expiresAt` and `createdAt`, never its token (PAD-269: the list used to hand every coach of the club every live link). Revoking from the list is `POST /api/app/club/<clubId>/coach-invitations/<id>/revoke` (403 for a non-member, 404 for an id outside the club, 410 unless pending). `POST /api/app/coach-invitations/<token>/revoke` still works for whoever holds the link.

8. **A new coach account is adults-only (PAD-457).** The new-user branch of the accept creates a
   login, so it takes `birthDate` and refuses exactly as sign-up does (`auth.register` rule 18, one
   shared check; 400 on `birthDate` with `BIRTH_DATE_REQUIRED`, `INVALID_BIRTH_DATE` or `UNDERAGE`), creating
   nothing on a refusal. The existing-coach branch creates no account and is unchanged. Web and iOS
   add the field.

9. **A coach who joins by invitation confirms their email (PAD-477, B-241; owner decision 2026-10-02).**
   - The new-user accept takes an `email`, validated as sign-up validates it (`auth.register`): a valid
     address, stored lowercased, unique ignoring case. A malformed one is `400 {"field": "email"}`; an
     address already registered is `409 {"field": "email"}`. Both are decided before anything is
     written. The invitation's own optional `email` is not used for the account.
   - A request that declares the client capability `coach-invite-email` (`X-LevApp-Capabilities`,
     `padel_app/utils/client_capabilities.py`) and sends no email is
     `400 {"field": "email", "code": "EMAIL_REQUIRED"}`, and nothing is written. The web bundle and iOS
     builds from 29 on declare it, and their accept forms always ask for the email.
   - **Legacy path.** A request that does NOT declare it and sends no email (iOS 1.2.0 (27) and
     1.2.1 (28), whose accept screen predates the field) is accepted as before PAD-477: the account is
     created without an email, no code is sent, and its state is `"unverified"` (never held). Remove
     this path, and the token's gate, once no build older than the first declaring one is in use. That
     is a compat-audit question at each promotion. It is countable: the query in B-241 counts coaches
     whose email is neither verified nor required to be, and those with no email at all.
   - When an email is accepted, from any build, the first verification code goes to it after the
     account is committed (`auth.email-verification` rule 6), so the coach's state is `"pending"`.
     Web and iOS hold them on Verify your email before the club or the dashboard
     (`auth.email-verification` rule 8). The club link exists at once (rule 4).
   - The authenticated existing-coach accept (rule 5) is unchanged. No client calls it today.

### Acceptance Criteria

#### An invited coach confirms their email (rule 9, PAD-477)
- **Given** a pending invitation and a client declaring `coach-invite-email`
- **When** it is accepted as a new user with email `Rita@Example.com`
- **Then** the account's email is `rita@example.com`, `/api/auth/me` says `"pending"`, one code was
  mailed to it after the commit, and the coach is in the club
- **When** the body has no email, **Then** 400 `EMAIL_REQUIRED` and nothing is written
- **When** the email is taken (in any case), **Then** 409 `field: "email"` and nothing is written

#### A build that predates the field accepts as before (rule 9, legacy path)
- **Given** a request without `coach-invite-email` and without an email
- **When** it accepts a pending invitation
- **Then** the account is created without an email, no code is sent, and its state is `"unverified"`

#### Accepting leads to the verify screen (rule 9, web and iOS)
- **Given** a new user accepts an invitation on web or iOS
- **Then** the next screen is Verify your email

#### A failed new-user accept leaves nothing and can be accepted again (rule 4, PAD-476)
- **Given** a pending invitation
- **When** the new-user accept fails after the default levels were written
- **Then** the answer is 500, no account or club link exists and the invitation is still pending
- **And** accepting it again is 200, with the coach in the club and the invitation accepted

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
