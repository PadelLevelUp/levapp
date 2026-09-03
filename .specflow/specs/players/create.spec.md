---
id: players.create
status: implemented
depends_on: [auth.login, clubs.crud]
implements: ../../specs-business/players/coach-builds-roster.business.md
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
