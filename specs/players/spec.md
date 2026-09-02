# players — Player Management

## players.invite-completion

---
id: players.invite-completion
status: implemented
depends_on: [players.create, clubs.coach-invitation, auth.activate]
---

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

---

## players.create

---
id: players.create
status: implemented
depends_on: [auth.login, clubs.crud]
---

### Intent
Coaches create player accounts for their students. The player starts as an inactive user who can later be activated via an invite link.

Choosing a username is **not** the coach's responsibility — a username is a credential the student
logs in with, so only the student picks it, when they activate their own account (either through the
player invite link, `players.invite-completion`, or the account activation link, `auth.activate`).
Coach-side player creation therefore never asks for, nor accepts, a username.

### Entities
- **Player** (`players`): user_id (FK → users)
- **User** (`users`): name, username, email, phone, status (inactive by default)
- **Association_CoachPlayer** (`coach_in_player`): coach_id, player_id, level_id, side (left|right|both), notes
- **Association_PlayerClub** (`player_in_club`): player_id, club_id

### Rules
1. Creating a player creates both a User (status=inactive) and a Player record
2. The player is automatically associated with the coach and the coach's current club
3. Coach can set initial level and preferred side (left/right/both). "Both" means the player is comfortable on either court side and is eligible for open spots of any side.
4. The coach never chooses the player's username. The add-player form exposes no username field, and
   any `username` sent by a coach client is ignored by the create endpoint. The User is created with a
   unique placeholder username (`pending-<random>`, the same mechanism as `players.invite-completion`),
   which is an internal detail and is never shown to the coach.
5. The player replaces the placeholder with a username of their own choosing when they activate their
   account — via the player invite link (`players.invite-completion`) or the account activation link
   (`auth.activate`). Uniqueness of a username is therefore enforced at activation, not at creation.
6. Coaches cannot edit a player's username after creation either — the coach-facing player detail and
   edit views expose no username field.
7. Email is optional
8. The level field lists the coach's defined levels. When the coach has levels, opening the field shows them as selectable options. When the coach has no levels defined yet, the field shows an explicit empty-state message pointing them to Settings to create levels — it must never open to a silently empty dropdown that looks broken.

### Acceptance Criteria

#### Create player
- **Given** an authenticated coach in club "Academy"
- **When** they POST to `/api/app/add_player` with `{"name": "John Doe", "email": "john@example.com"}` (no username)
- **Then** a User record is created with status `inactive` and a unique placeholder username
- **And** a Player record is created linked to the User
- **And** a `coach_in_player` association is created
- **And** a `player_in_club` association is created for the coach's current club

#### Add-player form asks the coach for no username
- **Given** an authenticated coach
- **When** they open the "new player" form
- **Then** no username input is shown
- **And** entering only a name is enough to enable the create action
- **And** the player is created successfully without the coach supplying a username

#### Coach cannot set a username on an existing player
- **Given** a player created by a coach
- **When** the coach opens that player's detail page and the edit sheet
- **Then** no username field is shown in either view

#### A coach-supplied username is ignored
- **Given** an authenticated coach
- **When** they POST to `/api/app/add_player` with `{"name": "Jane Doe", "username": "chosen-by-coach"}`
- **Then** the created User's username is a generated placeholder, not `chosen-by-coach`

#### Level field shows options when levels exist
- **Given** an authenticated coach who has defined levels (e.g. "B1 | Beginner", "I1 | Intermediate")
- **When** they open the new-player form and open the Level field
- **Then** each defined level is shown as a selectable option
- **And** selecting one sets it as the new player's initial level

#### Level field guides coach when no levels exist
- **Given** an authenticated coach who has not defined any levels
- **When** they open the new-player form and open the Level field
- **Then** an empty-state message is shown pointing them to Settings to create levels
- **And** the field does not open to a silently empty dropdown

---

## players.duplicate-name-check

---
id: players.duplicate-name-check
status: implemented
depends_on: [players.create, import.confirm]
---

### Intent
Warn coaches when a player they are about to create (manually or via Excel import) has the same
name as a player already on their roster, so they can avoid accidentally creating duplicate
records — without blocking them from proceeding if the duplicate is intentional (e.g. two real
students genuinely share a name).

### Rules
1. Matching is on the player **name**, compared **exactly** but **case-insensitively**
   (`"john doe"` matches `"John Doe"`; `"John Doe Jr"` does NOT match `"John Doe"`).
2. Behavior is **WARN, not BLOCK**: the duplicate is surfaced to the coach, but they may still
   proceed with creation/import.
3. Manual creation (`AddPlayerSheet`) surfaces a non-blocking warning under the Name field when
   the typed name matches an existing player of the coach. The "Create player" button remains
   enabled.
4. The name check reuses the PAD-7 field-validation infrastructure
   (`/api/app/check_field_available` + `useFieldAvailability`) via a warn-only variant so the
   duplicate name does not disable the submit button.
5. `POST /api/app/check_field_available` accepts `("user", "name")` and matches
   case-insensitively; unique fields (`username`, `email`) keep their existing exact match.
6. Excel import preview flags each Players row whose name matches an existing player, showing a
   clear "Possible duplicate" indicator. Flagged rows can still be imported.

### Acceptance Criteria

#### Manual creation warns on duplicate name (case-insensitive)
- **Given** a coach who already has a player named "John Doe"
- **When** they open the new-player form and type "john doe" in the Name field
- **Then** a non-blocking duplicate warning is shown under the Name field
- **And** the "Create player" button stays enabled so they can proceed anyway

#### No warning for a genuinely new name
- **Given** a coach who has a player named "John Doe"
- **When** they type "Jane Smith" in the Name field
- **Then** no duplicate warning is shown

#### Backend name check is case-insensitive
- **Given** an existing user named "John Doe"
- **When** POST `/api/app/check_field_available` with `{"model": "user", "field": "name", "value": "JOHN DOE"}`
- **Then** the response is 409 with a duplicate message

#### Import preview flags duplicate names
- **Given** a coach with an existing player "John Doe"
- **And** an analyzed Excel import whose Players table contains a row named "john doe"
- **When** the coach views the import preview
- **Then** that row is marked as a possible duplicate
- **And** the coach can still select and import it

---

## players.edit

---
id: players.edit
status: implemented
depends_on: [players.create]
---

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

---

## players.list

---
id: players.list
status: implemented
depends_on: [players.create]
---

### Intent
Coaches view their player roster with search, sorting, filtering, and pagination.

### Rules
1. `GET /api/app/coach_players` returns all coach-player pairs for the authenticated coach (with evaluations, notes)
2. `GET /api/app/coach_players_paginated` supports: page, per_page, search, sort_by, sort_dir, missing_level, missing_side
3. Search matches against player name (case-insensitive)
4. Sort options: name-asc, name-desc, level-asc, level-desc
5. Filters: `missing_level=true` (players without assigned level), `missing_side=true` (players without side preference)
6. Frontend uses 60-second LRU cache for paginated results, invalidated on mutations
7. The roster endpoints — `GET /api/app/players`, `/api/app/coach_players`,
   `/api/app/coach_players_paginated` — are **coach-only**. Each resolves the acting coach with
   `require_coach()` and returns **403** to a caller with no coach profile, before any query runs.
   A **500 is a violation of this rule**, not "access denied by accident": these routes used to
   dereference the nullable `current_coach()` (`coach.id`, and `current_club()` for `/players`) and
   raise an unhandled `AttributeError`. This mirrors `settings.role-scope` rules 6-7, which
   established the same contract for the Settings endpoints.

### Acceptance Criteria

#### Roster endpoints reject a student with 403
- **Given** an authenticated user with a player profile and no coach profile
- **When** they GET `/api/app/players`, `/api/app/coach_players`, or
  `/api/app/coach_players_paginated`
- **Then** each response status is exactly 403
- **And** no 500 is produced

#### Paginated player list
- **Given** a coach with 30 players
- **When** they GET `/api/app/coach_players_paginated?page=1&per_page=25`
- **Then** 25 players are returned with pagination metadata (total, pages)

#### Search players
- **Given** a coach with players "Alice", "Bob", "Alice B"
- **When** they GET `/api/app/coach_players_paginated?search=alice`
- **Then** only "Alice" and "Alice B" are returned

#### Filter by missing level
- **Given** a coach with 3 players, 1 without a level
- **When** they GET `/api/app/coach_players_paginated?missing_level=true`
- **Then** only the player without a level is returned

---

## players.profile

---
id: players.profile
status: implemented
depends_on: [players.create, evaluations.entries, players.notes]
---

### Intent
View a full player profile including evaluations, strengths, weaknesses, and level history.

### Rules
1. `GET /api/app/player_profile/{playerId}` returns full profile
2. Includes: player info, current level, evaluation scores (latest per category), strengths, weaknesses
3. Coach-specific: returns data from the coach's perspective (their notes, their evaluations)
4. Frontend route: `/players/:playerId`
5. The profile offers an "Add to classes" action that opens a week-by-week picker of the coach's
   class instances, backed by `GET /api/app/lesson_instances?from=&to=`. Every non-cancelled
   instance in the selected week is listed; instances already at capacity are shown but not
   selectable. The picker is **not** filtered by the player's level — a coach may add any player
   to any class
6. Client calls to `/api/app/lesson_instances` must use the HTTP verb the route exposes (`GET`).
   A verb mismatch fails the request and renders as an empty picker with no error surfaced
7. `GET /api/app/player_profile/{playerId}` is **coach-only**: it resolves the acting coach with
   `require_coach()` and returns **403** to a caller with no coach profile, before any query runs.
   A 500 is a violation of this rule. (Cross-coach ownership on this route is unchanged and remains
   as PAD-92 left it; this rule is only about the caller's *role*.)

### Acceptance Criteria

#### Player profile rejects a student with 403
- **Given** an authenticated user with a player profile and no coach profile
- **When** they GET `/api/app/player_profile/{anyId}`
- **Then** the response status is exactly 403, and no 500 is produced

#### Get player profile
- **Given** a player with id 5 who has 3 evaluation categories scored and 2 strengths noted
- **When** GET `/api/app/player_profile/5`
- **Then** the response includes player info, current evaluations (latest per category), strengths list, weaknesses list

#### "Add to classes" lists this week's classes
- **Given** a coach with a class scheduled this week that has free spots
- **And** a player on that coach's roster
- **When** the coach opens the player's profile and triggers "Add to classes"
- **Then** the dialog lists that class for its weekday
- **And** selecting it and confirming enrols the player in that class instance

---

## players.remove

---
id: players.remove
status: implemented
depends_on: [players.create]
---

### Intent
Remove a player from a coach's roster. Does not delete the user — just removes the coach-player association.

### Rules
1. Removes the `coach_in_player` association
2. Does not delete the User or Player records
3. Player can still be associated with other coaches

### Acceptance Criteria

#### Remove player
- **Given** a player with id 3 associated with the authenticated coach
- **When** they DELETE `/api/app/player/3`
- **Then** the `coach_in_player` association is removed
- **And** the User and Player records still exist

---

## players.add-existing

---
id: players.add-existing
status: draft
depends_on: [players.create]
---

### Intent
Add an already-existing player to a coach's roster (e.g., player already registered with another coach).

### Rules
1. `POST /api/app/coach/player` with player_id
2. Creates a new `coach_in_player` association
3. Player must already exist

### Status correction (2026-08-07)
This capability is **not implemented**, despite having read `implemented` since the tree was written.
No `coach/player` route exists in `padel_app/modules/`, and every path that builds an
`Association_CoachPlayer` creates a brand-new User and Player first. A second coach therefore has no
way to take on an existing student except by creating a duplicate person — and the duplicate-name
warning does not fire across coaches, because it is deliberately scoped to the calling coach's own
roster.

Rules 1–3 above are the intended design and are retained as such. Two open decisions before this is
built:
- **Consent.** Attaching a student to a roster grants that coach their attendance, evaluations and
  direct-message access. The student should approve rather than be assigned.
- **Discovery.** `player_search` is roster-scoped by design; a cross-roster search is a privacy
  widening that needs its own decision.

A coach-scoped join token that the student redeems while authenticated (the QR flow) satisfies both
and is the same backend capability initiated from the other side.

---

## players.notes

---
id: players.notes
status: implemented
depends_on: [players.create]
---

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

---

## players.level-history

---
id: players.level-history
status: implemented
depends_on: [players.create, levels.coach-levels]
---

### Intent
Track the history of level assignments for a player, providing an audit trail.

### Entities
- **PlayerLevelHistory** (`player_level_history`): player_id, coach_id, level_id, assigned_at

### Rules
1. Every level change creates a new history entry
2. `player.level` returns the most recent entry (ordered by `assigned_at DESC`)
3. History is per-coach — different coaches may assign different levels to the same player

### Acceptance Criteria

#### Level change tracked
- **Given** a player currently at level "Beginner"
- **When** a coach changes their level to "Intermediate"
- **Then** a new `player_level_history` entry is created with the new level
- **And** `player.level` returns "Intermediate"
