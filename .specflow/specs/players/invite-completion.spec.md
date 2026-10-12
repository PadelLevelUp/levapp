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
- **PlayerInvitation** (`player_invitations`): player_id (FK → players, CASCADE), token_hash (unique;
  the SHA-256 hex of the token, which is never stored, PAD-269),
  invited_by_coach_id (FK → coaches, SET NULL — PAD-255), status (pending|accepted|revoked|expired), expires_at, created_at

### State model
- "Pending" profile ⇒ the player's `users.status` is `inactive` (created by the coach, no real account yet).
- "Active" profile ⇒ the player's `users.status` is `active` (player completed the profile).
- The existing `activation_status` enum (`inactive`/`active`/`disabled`) is reused as-is; "pending"
  maps to `inactive` and "active" to `active`. No new enum value or DB migration on `users.status`.

### Rules
1. A coach can create an incomplete player with only: name (required), level, and side. No username is
   required at creation. The player's User is created with status `inactive` and a placeholder username.
2. Creating an incomplete player generates a PlayerInvitation with a unique single-use token, expiring
   after 7 days (`secrets.token_urlsafe`), following the coach-invitation pattern. Only the
   token's SHA-256 hash is stored (PAD-269): the token appears once, in the creation response's
   `inviteLink`. Links issued before PAD-269 keep working, because its migration hashed the
   stored tokens in place. The coach is handed it on the public web origin (`players.join-token`
   rule 3a, PAD-595).
3. Only the coach associated with the player may create or revoke a player invitation.
4. Frontend route: `/invite/player/:token` — a public (unauthenticated) profile-completion form.
5. The completion form lets the player set their own username (unique across users), password, and
   optional email/phone.
6. Accepting the invitation: updates the player's User with the chosen username/password/details, sets
   `users.status` to `active`, marks the invitation `accepted`, and returns an access token so the
   player is logged in.
7. Used, revoked, or expired tokens are rejected (410). Unknown tokens are rejected (404).
8. Username chosen at completion must be unique; a taken username is rejected (409).
9. *(draft, 2026-09-06)* The completion page also offers **"Already have an account? Sign in to
   link it"**. A visitor who signs in (or is already signed in as a student) is offered
   `players.claim` trigger A instead of the completion form: the coach's record is merged into
   their existing account and the invitation is `accepted`. The two paths are exclusive — a
   token is consumed by whichever runs first.

10. **Adults only (PAD-457).** Completing the invitation creates a login, so the body also carries
    `birthDate` (`YYYY-MM-DD`), judged exactly as sign-up judges it (`auth.register` rule 18, one shared
    check): absent → 400 `BIRTH_DATE_REQUIRED` (bilingual "update the app" text), not a real past date →
    400 `INVALID_BIRTH_DATE`, under 18 → 400 `UNDERAGE`, all on `field: "birthDate"`. A refusal writes
    nothing (no username, no password, the account stays `inactive`, the invitation stays pending); an
    accepted date is stored on the user. Web and iOS add the field (iOS typed DD/MM/AAAA).
10a. **The country (PAD-604; Privacy Policy §1).** The body also carries
    `country` (ISO 3166-1 alpha-2, stored upper-cased on `users.country`), validated with sign-up's
    check (`auth.register` rule 18): a value that is not two letters is 400 `{field: "country", code:
    "INVALID_COUNTRY"}`. A request that declares the client capability `country-on-completion`
    (`X-LevApp-Capabilities`, PAD-352) and sends no country is 400 `{field: "country", code:
    "COUNTRY_REQUIRED"}` with the bilingual "update the app" text. **Legacy path:** a request that does
    not declare it (iOS up to 1.3.0 (32), whose form predates the field) and sends none is accepted, and
    the country stays as it was (null on a new account; PAD-630 asks for it later). Checked after the
    birth date; every refusal writes nothing. Web and iOS ask for it, required, default PT, from
    `COUNTRIES` (`@levelup/config`), as the sign-up form does, and declare the capability.

10b. **The Terms are accepted (PAD-637; `auth.register` rule 19b).** Completing the player invitation shows the same required
    "I have read and accept the Privacy Policy and the Terms of Service" checkbox as sign-up, each
    document a link, and sends `termsAccepted: true`. A client that declares `terms-on-completion` and
    does not send it is 400 `{field: "terms", code: "TERMS_REQUIRED"}`, checked after the country, and
    nothing is written. On success the user records `terms_accepted_at`, `terms_version` and
    `privacy_version`. **Legacy path:** a client that does not declare the token completes as before
    with the three columns NULL (the next-login screen asks, `auth.legal-catch-up`). Web and iOS add the
    box and declare the token.

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

#### Invite page offers linking to an existing account
- **Given** a pending player invitation token
- **When** a visitor with an active student session opens `/invite/player/<token>`
- **Then** the page offers "Link this record to my account" instead of asking for a new username and password
- **And** confirming calls `POST /api/app/player-invitations/<token>/claim` (see `players.claim`)

#### An invitation refuses someone under 18 (PAD-457)
- **Given** a coach's pending player invitation, today 2026-09-25 (UTC)
- **When** it is accepted with username `teen457`, a password and `birthDate` `2008-09-26`
- **Then** the response is 400 `UNDERAGE` on `birthDate` and no user holds `teen457`

#### Completing the invitation stores the country (rule 10a, PAD-604)
- **Given** a pending player invitation and a client declaring `country-on-completion`
- **When** the invitee accepts with a username, a password, an adult `birthDate` and `country: "BR"`
- **Then** the account is active and `users.country` is `BR`
- **And** without `country` it is 400 `COUNTRY_REQUIRED`, and the invitation stays pending
- **And** with no capability declared and no `country`, the accept succeeds with no country

#### An adult completes the invitation with a birth date (PAD-457)
- **Given** the same invitation
- **When** it is accepted with `birthDate` `2008-09-25` (18 today)
- **Then** the account is `active` and its `birth_date` is 2008-09-25; without a `birthDate` it is 400 `BIRTH_DATE_REQUIRED`

#### The Terms are recorded on completion (rule 10b, PAD-637)
- **Given** a client declaring `terms-on-completion`
- **When** it completes with `termsAccepted: true`
- **Then** the new account records `terms_accepted_at`, `terms_version` and `privacy_version`
- **And** without it the answer is 400 `TERMS_REQUIRED`, and the account is not created or activated
- **And** a client that does not declare the token completes as before, with the columns NULL
