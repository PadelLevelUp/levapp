---
id: players.create
status: implemented
depends_on: [auth.login, clubs.crud]
serves: [P-PLAYERS-2]
governed_by: []
---

# players.create


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

9. **Creating a player is one transaction (PAD-272 pilot, audit M8).** `add_player_service` runs
   inside a unit of work (`padel_app/tools/unit_of_work.py`): the User, the Player, the coach link
   and the level-history row are flushed as they are built and committed once at the end, and any
   failure part-way (a level that does not exist, a unique clash, a database error) rolls the whole
   thing back — no orphan `users` or `players` row is left behind. This is the pilot of the
   request-scoped-transaction decision (`2026-09-11-request-scoped-transactions`): `Model.create`,
   `save` and `delete` flush instead of committing while a unit of work is open and behave exactly as
   before outside one, so no other service changes.

10. **Adults only on a roster (PAD-642; owner decision 2026-10-12, "forbid under-18").** The Terms say a
    coach may only add people aged 18 or over (Terms §2, `auth.legal-pages`). Creating a player (`POST
    /add_player`, `POST /incomplete_player`) carries `confirmsAdults: true`: the coach ticks "Confirmo que
    este aluno tem 18 anos ou mais" / "I confirm this student is 18 or older" before saving (web
    AddPlayerSheet, iOS `player/new`). A request that declares the capability
    `adult-roster-confirmation` and does not send it is 400 `{field: "confirmsAdults", code:
    "ADULTS_CONFIRMATION_REQUIRED"}` and nothing is written. **Legacy path:** a client that does not
    declare the token creates as before. No date of birth is collected for a roster entry; the student
    gives it when the account is completed (`auth.activate` rule 13).

### Acceptance Criteria

#### PLAYERS-CREATE-1: Create player
- **Given** an authenticated coach in club "Academy"
- **When** they POST to `/api/app/add_player` with `{"name": "John Doe", "email": "john@example.com"}` (no username)
- **Then** a User record is created with status `inactive` and a unique placeholder username
- **And** a Player record is created linked to the User
- **And** a `coach_in_player` association is created
- **And** a `player_in_club` association is created for the coach's current club

#### PLAYERS-CREATE-2: Add-player form asks the coach for no username
- **Given** an authenticated coach
- **When** they open the "new player" form
- **Then** no username input is shown
- **And** entering only a name is enough to enable the create action
- **And** the player is created successfully without the coach supplying a username

#### PLAYERS-CREATE-3: Coach cannot set a username on an existing player
- **Given** a player created by a coach
- **When** the coach opens that player's detail page and the edit sheet
- **Then** no username field is shown in either view

#### PLAYERS-CREATE-4: A coach-supplied username is ignored
- **Given** an authenticated coach
- **When** they POST to `/api/app/add_player` with `{"name": "Jane Doe", "username": "chosen-by-coach"}`
- **Then** the created User's username is a generated placeholder, not `chosen-by-coach`

#### PLAYERS-CREATE-5: Level field shows options when levels exist
- **Given** an authenticated coach who has defined levels (e.g. "B1 | Beginner", "I1 | Intermediate")
- **When** they open the new-player form and open the Level field
- **Then** each defined level is shown as a selectable option
- **And** selecting one sets it as the new player's initial level

#### PLAYERS-CREATE-6: Level field guides coach when no levels exist
- **Given** an authenticated coach who has not defined any levels
- **When** they open the new-player form and open the Level field
- **Then** an empty-state message is shown pointing them to Settings to create levels
- **And** the field does not open to a silently empty dropdown

#### PLAYERS-CREATE-7: Creating a player is all or nothing (PAD-272)
- **Given** an authenticated coach
- **When** they add a player whose `levelId` does not exist, so the coach link cannot be written after the User and Player rows already were
- **Then** the request fails
- **And** no `users` row and no `players` row remain for that player
- **And** a player added with a valid level still produces the four rows of "Create player"

#### PLAYERS-CREATE-8: The coach confirms the student is an adult (rule 10, PAD-642)
- **Given** a client declaring `adult-roster-confirmation`
- **When** the coach creates a player without `confirmsAdults: true`
- **Then** the answer is 400 `ADULTS_CONFIRMATION_REQUIRED` and no player, user or roster row exists
- **And** with `confirmsAdults: true` the player is created as before
- **And** a client that does not declare the token creates as before

#### PLAYERS-CREATE-9: A new placeholder has no password, a username of its own, and nothing where a field was left empty (rules 1, 4, 7)
- **Given** a coach
- **When** they create two players, sending empty strings or nothing for e-mail, phone, notes and side, and a third with real values
- **Then** each account has no password and a different generated username
- **And** the empty and the absent fields are stored as NULL, and the two players coexist
- **And** the real values are stored as sent
test: `backend/padel_app/tests/test_pad105_coach_never_sets_username.py` › `test_placeholder_accounts_have_no_password` (+4 more)

#### PLAYERS-CREATE-10: The add-player form cannot save until the coach confirms the student is an adult (rule 10)
- **Given** the add-player form on web or iOS with a name typed
- **When** the coach presses save before and after ticking the confirmation
- **Then** before the tick nothing is saved, and on web both the save and the save-and-invite buttons are disabled
- **And** after the tick the save goes out with `confirmsAdults: true`
- **And** the edit form shows no such box
test: `frontend/apps/mobile/src/features/players/player-form-adults.test.tsx` › `does not save until the coach confirms the student is an adult` (+4 more)
