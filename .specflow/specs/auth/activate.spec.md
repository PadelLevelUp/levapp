---
id: auth.activate
status: implemented
depends_on: [auth.register]
implements: ../../specs-business/auth/newcomer-creates-and-activates-an-account.business.md
governed_by: []
---

# auth.activate


### Intent
Activate a pre-created user account (e.g., a player invited by their coach). Sets password and transitions status to `active`.

### Rules
1. User must exist and have status `inactive`
2. Sets password and transitions status to `active`
3. Frontend route: `/register/:userId`
4. This is where a coach-created player chooses their own username: `players.create` assigns only a
   placeholder, and the activation form is one of the two places (with `players.invite-completion`)
   where the user replaces it with a username of their choosing. The chosen username must be unique.
5. `GET /api/app/register/user/<id>` must NOT return a placeholder username — it returns `null` for
   the username instead, so the activation form's username box is empty. Prefilling the generated
   `pending-…` value would leak an internal detail and nudge the user into keeping a
   machine-generated login. A username the user already chose IS returned and prefilled.
6. `GET /api/app/register/user/<id>` is public and the id is guessable, so it answers the public
   user shape only (`id`, `name`, `username`, `role`, `avatarUrl`, `abbreviation`, `isActive`) —
   never `email` or `phone` (PAD-227, B-031). The activation form asks the person for their email
   and phone instead of pre-filling them; what they type is saved on activation as before.

### Acceptance Criteria

#### Activate user
- **Given** a user with id 5 and status `inactive`
- **When** POST to `/api/app/activate/user/5` with `{"password": "NewPass1!", "name": "Updated Name"}`
- **Then** the user's status becomes `active`
- **And** the password hash is updated

#### Activation form does not prefill a placeholder username
- **Given** a coach-created player whose User holds a generated `pending-…` username
- **When** the activation form GETs `/api/app/register/user/<id>`
- **Then** the returned `username` is `null` and the form's username field renders empty
- **And** for a user who already chose a username, that username is returned and prefilled

#### Activation lookup carries no contact details (PAD-227)
- **Given** an inactive user with email `ana@example.com` and phone `912345678`
- **When** anyone, without a token, GETs `/api/app/register/user/<id>`
- **Then** the response has `name`, `username`, `role`, `isActive` and no `email` or `phone` key
- **And** the activation form shows empty email and phone fields for the person to fill in
