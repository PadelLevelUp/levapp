---
id: auth.login
status: implemented
depends_on: []
implements: ../../specs-business/auth/coach-signs-in-and-stays-connected.business.md
governed_by: []
---

# auth.login


### Intent
Allow users to authenticate with username/email and password, receiving a JWT token for subsequent API calls.

### Entities
- **User** (`users`): name, username, email, phone, password (hashed), is_admin, is_superadmin, status (inactive|active|disabled), user_image_id, language (`pt`|`en`, default `pt` — preferred locale; see settings.language)
- **TokenBlocklist** (`token_blocklist`): jti (JWT ID), created_at

### Rules
1. Login accepts `username` (or email) + `password`
2. Password is verified against bcrypt hash stored in `users.password`
3. Returns JWT access token with 30-day expiry
4. Token is sent in the `Authorization` header. The `?token=` query string is accepted on the SSE
   endpoint `/api/app/events` alone, because `EventSource` cannot set headers (R-009; PAD-269 —
   until then the query string worked on every route and put tokens in access logs).
5. Token contains user identity (user_id)
11. **An account with no password yet** (created by a coach, not activated) answers the ordinary
    401 `Invalid credentials`, never a 500 — the 500 told a caller which usernames exist (PAD-269,
    audit M11). Numbered 11 to stay clear of rules 6–10 in parallel branches.

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

#### A token in the query string is refused outside the SSE endpoint (PAD-269)
- **Given** a valid access token for `coach1`
- **When** they GET `/api/auth/me?token=<the token>` with no `Authorization` header
- **Then** the response is 401
- **And** GET `/api/app/events?token=<the token>` is accepted (200, `text/event-stream`)

#### An unactivated account is an ordinary 401 (PAD-269)
- **Given** a coach-created user `bruno` with no password
- **When** anyone POSTs `/api/auth/login` with `{"username": "bruno", "password": "anything"}`
- **Then** the response is 401 `Invalid credentials`, not 500

#### Inactive user login
- **Given** a user with status `inactive`
- **When** they attempt to login
- **Then** the response status is 401

### Notes
- OPEN: No rate limiting on login attempts
- OPEN: No account lockout after failed attempts
