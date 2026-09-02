# auth — Authentication & User Management

## auth.login

---
id: auth.login
status: implemented
depends_on: []
---

### Intent
Allow users to authenticate with username/email and password, receiving a JWT token for subsequent API calls.

### Entities
- **User** (`users`): name, username, email, phone, password (hashed), is_admin, is_superadmin, status (inactive|active|disabled), user_image_id, language (`pt`|`en`, default `pt` — preferred locale; see settings.language)
- **TokenBlocklist** (`token_blocklist`): jti (JWT ID), created_at

### Rules
1. Login accepts `username` (or email) + `password`
2. Password is verified against bcrypt hash stored in `users.password`
3. Returns JWT access token with 30-day expiry
4. Token can be sent via Authorization header or query string (`?token=`)
5. Token contains user identity (user_id)

### Acceptance Criteria

#### Successful login
- **Given** a user with username `coach1` and password `SecurePass1!` exists with status `active`
- **When** they POST to `/api/auth/login` with `{"username": "coach1", "password": "SecurePass1!"}`
- **Then** the response status is 200
- **And** the response body contains `{"accessToken": "<valid-jwt>"}`

#### Invalid credentials
- **Given** a user with username `coach1` exists
- **When** they POST to `/api/auth/login` with wrong password
- **Then** the response status is 401

#### Inactive user login
- **Given** a user with status `inactive`
- **When** they attempt to login
- **Then** the response status is 401

### Notes
- OPEN: No rate limiting on login attempts
- OPEN: No account lockout after failed attempts

---

## auth.logout

---
id: auth.logout
status: implemented
depends_on: [auth.login]
---

### Intent
Invalidate the current JWT token so it cannot be reused.

### Rules
1. Adds the JWT's `jti` claim to `token_blocklist`
2. Subsequent requests with this token return 401

### Acceptance Criteria

#### Successful logout
- **Given** an authenticated user with a valid JWT
- **When** they POST to `/api/auth/logout`
- **Then** the response status is 200
- **And** the JWT's `jti` is added to `token_blocklist`
- **And** subsequent requests with that token return 401

---

## auth.register

---
id: auth.register
status: implemented
depends_on: []
---

### Intent
Create a new user account. Users are created with `inactive` status and must be activated separately.

### Rules
1. Requires name, username, password
2. Email is optional
3. Username must be unique
4. User is created with status `inactive`

### Acceptance Criteria

#### Successful registration
- **Given** no user with username `newuser` exists
- **When** POST to `/api/auth/register` with `{"name": "New User", "username": "newuser", "password": "Pass123!"}`
- **Then** the response status is 201
- **And** a User record is created with status `inactive`

---

## auth.activate

---
id: auth.activate
status: implemented
depends_on: [auth.register]
---

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

---

## auth.token-refresh

---
id: auth.token-refresh
status: implemented
depends_on: [auth.login]
---

### Intent
Silently refresh JWT tokens before they expire, avoiding forced re-login.

### Rules
1. On every API response, if the JWT expires in < 15 days, the backend issues a new token in the `X-New-Token` response header
2. Frontend axios interceptor reads `x-new-token` and updates localStorage
3. This is transparent — no explicit refresh endpoint needed for normal flow
4. An explicit `POST /api/auth/refresh` endpoint also exists

### Acceptance Criteria

#### Silent token refresh
- **Given** a user with a JWT expiring in 10 days
- **When** they make any authenticated API request
- **Then** the response includes an `X-New-Token` header with a fresh JWT
- **And** the frontend stores the new token

---

## auth.push-subscription

---
id: auth.push-subscription
status: implemented
depends_on: [auth.login]
---

### Intent
Register browser push notification subscriptions for authenticated users.

### Entities
- **PushSubscription** (`push_subscriptions`): user_id (unique), subscription_json (VAPID payload)

### Rules
1. One subscription per user (upsert behavior)
2. `POST /api/auth/push_subscription` to register
3. `DELETE /api/auth/push_subscription` to unregister
4. Subscription registered on login via frontend `requestAndSubscribe()`

### Acceptance Criteria

#### Register push subscription
- **Given** an authenticated user
- **When** they POST to `/api/auth/push_subscription` with a valid VAPID subscription JSON
- **Then** the subscription is stored (or updated if existing)
- **And** push notifications can be sent to this user
