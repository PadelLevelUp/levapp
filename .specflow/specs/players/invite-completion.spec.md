---
id: players.invite-completion
status: implemented
depends_on: [players.create, clubs.coach-invitation, auth.activate]
implements: ../../specs-business/players/coach-builds-roster.business.md
governed_by: []
---

# players.invite-completion


### Intent
Instead of the coach filling in every player detail (including the username), a coach can create an
"incomplete" player with only the basics — name, skill level, and preferred court side — and generate
a secure, single-use invite link. The player opens the link and completes their own profile (choosing
their username, setting a password, adding personal details), which transitions the account from
pending to active.

This reuses the coach-invitation token mechanism (`clubs.coach-invitation`): a random URL-safe token,
7-day expiry, single-use enforced via a status enum.

### Entities
- **PlayerInvitation** (`player_invitations`): player_id (FK → players, CASCADE), token (unique),
  invited_by_coach_id (FK → coaches), status (pending|accepted|revoked|expired), expires_at, created_at

### State model
- "Pending" profile ⇒ the player's `users.status` is `inactive` (created by the coach, no real account yet).
- "Active" profile ⇒ the player's `users.status` is `active` (player completed the profile).
- The existing `activation_status` enum (`inactive`/`active`/`disabled`) is reused as-is; "pending"
  maps to `inactive` and "active" to `active`. No new enum value or DB migration on `users.status`.

### Rules
1. A coach can create an incomplete player with only: name (required), level, and side. No username is
   required at creation. The player's User is created with status `inactive` and a placeholder username.
2. Creating an incomplete player generates a PlayerInvitation with a unique single-use token, expiring
   after 7 days (`secrets.token_urlsafe`), following the coach-invitation pattern.
3. Only the coach associated with the player may create or revoke a player invitation.
4. Frontend route: `/invite/player/:token` — a public (unauthenticated) profile-completion form.
5. The completion form lets the player set their own username (unique across users), password, and
   optional email/phone.
6. Accepting the invitation: updates the player's User with the chosen username/password/details, sets
   `users.status` to `active`, marks the invitation `accepted`, and returns an access token so the
   player is logged in.
7. Used, revoked, or expired tokens are rejected (410). Unknown tokens are rejected (404).
8. Username chosen at completion must be unique; a taken username is rejected (409).

### Acceptance Criteria

#### Coach creates an incomplete player and gets an invite link
- **Given** an authenticated coach
- **When** they POST to `/api/app/incomplete_player` with `{"coachId": <id>, "name": "Nina Pending", "side": "right"}` (no username)
- **Then** a User is created with status `inactive` and a Player + `coach_in_player` association
- **And** a PlayerInvitation is created with status `pending` and a unique token
- **And** the response contains the shareable invite link `/invite/player/<token>`

#### Invite link leads to a profile-completion form
- **Given** a pending player invitation token
- **When** an unauthenticated visitor GETs `/api/app/player-invitations/<token>`
- **Then** the response returns the player's name and status `pending`

#### Player completes their profile
- **Given** a pending player invitation token for an inactive player
- **When** an unauthenticated visitor POSTs to `/api/app/player-invitations/<token>/accept` with `{"username": "nina", "password": "Nina123!"}`
- **Then** the player's User username/password are set and `users.status` becomes `active`
- **And** the invitation becomes `accepted`
- **And** the response contains an access token

#### Expired/used token
- **Given** a player invitation that is expired, revoked, or already accepted
- **When** anyone attempts to view or accept it
- **Then** the response status is 410

#### Taken username rejected at completion
- **Given** a pending player invitation and an existing user with username "taken"
- **When** the visitor POSTs to accept with `{"username": "taken", "password": "Pass123!"}`
- **Then** the response status is 409
