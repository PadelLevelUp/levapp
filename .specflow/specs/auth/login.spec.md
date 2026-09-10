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
4. Token can be sent via Authorization header or query string (`?token=`)
5. Token contains user identity (user_id)
6. A rejected coach's correct credentials answer 403 `COACH_REJECTED` with the reason and no
   token (`auth.coach-approval` rule 11); the login screens offer re-application (its rule 13).

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

#### Rejected coach cannot log in (PAD-233)
- **Given** coach `rui` rejected with reason "not a coach"
- **When** they POST `/api/auth/login` with the right password
- **Then** the response is 403 `{"error": "COACH_REJECTED", "reason": "not a coach"}`

#### Inactive user login
- **Given** a user with status `inactive`
- **When** they attempt to login
- **Then** the response status is 401

### Notes
- OPEN: No rate limiting on login attempts
- OPEN: No account lockout after failed attempts
