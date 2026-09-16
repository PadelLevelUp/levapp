---
id: auth.activate
status: implemented
depends_on: [auth.register]
implements: ../../specs-business/auth/newcomer-creates-and-activates-an-account.business.md
governed_by: []
---

# auth.activate


### Intent
Activate a pre-created user account (e.g., a player created by their coach). The person holding
the link the coach shared sets their password, picks their username and confirms their contact
details; the account moves from `inactive` to `active`. Nobody else can complete that account, and
the account's numeric id alone opens nothing (B-034, PAD-254).

### Entities
- **READS:** User (`id`, `status`, `created_at`), Player (roster lookup of the owning coach)
- **WRITES:** User (`name`, `username`, `email`, `phone`, `password`, `status`)

### Rules
1. An account created on someone's behalf starts `inactive`. Only an `inactive` account can be
   activated; any other status is refused (rule 6).
2. **The link carries a per-account secret.** The activation link is
   `/register/<userId>?t=<token>`. The token is `HMAC-SHA256(SECRET_KEY, "activate:<userId>:<createdAt ISO>")`
   in hex (64 chars): deterministic, so it needs no column and survives restarts; unguessable
   without the server secret; and it changes only if `SECRET_KEY` rotates. It is compared in
   constant time. `padel_app/tools/activation_token.py` is the single place that builds and
   verifies it.
3. **Only the owning coach sees the secret.** The roster payload (`_serialize_coach_player_relation`
   and `Player.coach_player_info`, i.e. `GET /api/app/coach_players`, `add_player`, `edit_player`)
   carries `activationToken` while the player's account is `inactive`, and `null` afterwards. No
   other payload ever includes it.
4. **`GET /api/app/register/user/<id>` needs the token** (`?token=`). A missing or wrong token is
   404, exactly like an unknown id, so the route cannot be used to enumerate accounts. With the
   right token it returns only `{id, name, username, email, phone, isActive}` while the account is
   `inactive`, and `{"isActive": true}` alone once it is not — enough for the "already registered"
   screen, with no contact details.
5. **`POST /api/app/activate/user/<id>` needs the token** (`token` in the JSON body). A missing or
   wrong token is 404 and writes nothing.
6. With the right token, the POST is 410 unless the account is `inactive`, and writes nothing.
7. **Activation writes exactly five fields:** `name`, `username`, `email`, `phone`, `password`, and
   sets `status = active`. Everything else in the body is ignored — `status`, `language`, the
   privilege flags (PAD-93) and any other column. The guard lives in `activate_user_service`, so
   it holds for any route that calls in.
8. Frontend route: `/register/:userId` on web and iOS. Both read `t` from the link and pass it to
   both API calls. Without a `t` the screen shows its invalid-link state immediately and makes no
   request. A link shared before this rule (no `t`) therefore stops working; the coach re-shares
   from the player screen, where the link now carries the secret.
9. This is where a coach-created player chooses their own username: `players.create` assigns only a
   placeholder, and the activation form is one of the two places (with `players.invite-completion`)
   where the user replaces it with a username of their choosing. The chosen username must be unique.
10. The GET must NOT return a placeholder username — it returns `null` for the username instead, so
    the activation form's username box is empty. Prefilling the generated `pending-…` value would
    leak an internal detail and nudge the user into keeping a machine-generated login. A username
    the user already chose IS returned and prefilled.

### Acceptance Criteria

#### Activate user
- **Given** a user with id 5 and status `inactive`, and `t` = the token rule 2 derives for user 5
- **When** POST to `/api/app/activate/user/5` with `{"token": t, "password": "NewPass1!", "name": "Updated Name"}`
- **Then** the user's status becomes `active`
- **And** the password hash is updated and the name is `Updated Name`

#### The id alone opens nothing
- **Given** user 5 `inactive` with name `Bruno`, email `bruno@example.com`
- **When** anyone GETs `/api/app/register/user/5` with no `token`, or with `token=wrong`
- **Then** the response is 404 and its body contains neither `Bruno` nor `bruno@example.com`
- **When** anyone POSTs `/api/app/activate/user/5` `{"password": "Hijack1!"}` with no token, or with a wrong one
- **Then** the response is 404, the status is still `inactive` and no password is set

#### Only an inactive account can be activated
- **Given** user 7 `active` with password `Original1!` and `t` = its token
- **When** POST `/api/app/activate/user/7` `{"token": t, "password": "Other1!"}`
- **Then** the response is 410 and `Original1!` still verifies
- **When** GET `/api/app/register/user/7?token=<t>`
- **Then** the body is exactly `{"isActive": true}`

#### Activation writes only the five fields
- **Given** user 5 `inactive`, language `pt`, `is_superadmin` false
- **When** POST with the right token and `{"password": "NewPass1!", "username": "bruno", "status": "disabled", "language": "en", "is_superadmin": true}`
- **Then** the user is `active`, username `bruno`, language still `pt`, `is_superadmin` still false

#### The coach's roster carries the secret while the account is inactive
- **Given** coach `maria` adds player `Bruno` (`POST /api/app/add_player`)
- **When** she reads the response and `GET /api/app/coach_players`
- **Then** both carry `activationToken` equal to rule 2's token for Bruno's user
- **And** after Bruno activates, `activationToken` is `null`

#### Activation form does not prefill a placeholder username
- **Given** a coach-created player whose User holds a generated `pending-…` username
- **When** the activation form GETs `/api/app/register/user/<id>?token=<t>`
- **Then** the returned `username` is `null` and the form's username field renders empty
- **And** for a user who already chose a username, that username is returned and prefilled

#### The web and iOS screens refuse a link without its secret
- **Given** the coach's player page shows `https://<origin>/register/12?t=<t>`
- **When** a browser opens `/register/12` (no `t`)
- **Then** the invalid-link screen renders and no request to `/api/app/register/user/12` is made
- **When** it opens the full link
- **Then** the form renders with Bruno's name and an empty username box, and activation succeeds
- **And** the iOS `RegisterScreen` behaves the same, reading `t` from the universal link

### Notes
- Why a derived token rather than a column: the fix had to ship without a migration in the
  2026-09-09 overnight wave (three sibling Alembic heads already open), and a stateless HMAC gives
  the same property the audit asked for — the id is not the secret. `PlayerInvitation` stays the
  model for the newer "create & invite" path (`players.invite-completion`), which is single-use
  and expiring; this path is neither, because activation itself closes it (rule 6).
- `assert_production_secrets` already refuses to boot prod with the dev `SECRET_KEY`, so the token
  is never derived from a committed value in production.
- The token rides in the query string of the share link and of the GET; that is the same
  exposure as `/invite/player/<token>` today and is covered by the M11 ticket (PAD-269).
- PAD-227 (B-031) briefly made this GET answer the public user shape only, without email or
  phone, because the id was guessable. The per-account token (rule 4) replaces that premise:
  only the person holding the coach's link can read the lookup, so it prefills their own contact
  details again. The public user shape still governs the users list and the messageable picker
  (`messaging.conversations` rule 15). Decided in the 2026-09-10 batch merge.
