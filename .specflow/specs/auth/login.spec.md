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
6. The login screen (web `/auth` and the iOS login screen) carries a **Forgot your password?** link under the sign-in button that opens `auth.password-recovery` (its rule 7).
7. **Per-IP throttle (PAD-228).** `POST /api/auth/login` is throttled per client IP by `padel_app/utils/rate_limit.py`: at most N requests per window per IP, N/window from the config knob `AUTH_RATE_LIMIT_LOGIN` (`"count/seconds"`, default `20/60`; `"0"` or `AUTH_RATE_LIMIT_ENABLED=0` switches it off, which the E2E backends do). A request over the limit is 429 `{"error": "RATE_LIMITED", "retryAfterSeconds": n}` with a `Retry-After` header and is not processed. The window slides; successful and failed requests count alike. The IP is the first `X-Forwarded-For` entry when present (Cloud Run sits behind a load balancer), else `remote_addr`. The store is in-process (prod runs one gunicorn worker); a restart empties it. Account lockout after repeated failures (B-002) stays out of scope.
8. **The launch animation plays only on success (PAD-186).** On web, the mark-forming overlay
   (`LaunchOverlayProvider` / `launch-loader`) is started only after `POST /api/auth/login` has
   answered 200 — never before the request goes out — so a wrong password, a throttled attempt or
   a network error shows the error toast on the untouched form and the loader never mounts. The
   session hydration and `/api/auth/me` still run behind the overlay. Web-only: the iOS app has no
   sign-in animation (its launch animation runs at app start, `app/_layout.tsx`, not on login), so
   there is nothing to port (R-024 exception recorded here and in the PR).
9. A rejected coach's correct credentials answer 403 `COACH_REJECTED` with the reason and no
   token (`auth.coach-approval` rule 11); the login screens offer re-application (its rule 13).
10. **Guardian consent (PAD-198).** Right credentials of a user whose `guardian_consent_status` is
    `pending` answer 403 `GUARDIAN_CONSENT_PENDING` with the masked guardian email and no token; a
    `disabled` user (deleted, or withdrawn by a guardian) gets the ordinary 401
    (`auth.parental-consent` rule 4). Numbered 10 to stay clear of rules 6–9 added by PAD-139,
    PAD-228, PAD-186 and PAD-233 in parallel branches.

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

#### Too many logins from one IP are throttled
- **Given** `AUTH_RATE_LIMIT_LOGIN` is `3/60` and no requests yet from `203.0.113.7`
- **When** that IP POSTs `/api/auth/login` four times within a minute (right or wrong password)
- **Then** the first three are processed and the fourth is 429 `{"error": "RATE_LIMITED", "retryAfterSeconds": n}` with a `Retry-After` header
- **And** a POST from `203.0.113.8` in the same minute is processed
- **And** once the window has passed the first IP is processed again

#### A failed login never shows the launch animation (PAD-186)
- **Given** the web login form and a `/api/auth/login` that answers 401 after a delay
- **When** the user submits a wrong password
- **Then** while the request is in flight and after the error toast appears, no `launch-loader` element exists on the page
- **When** the user submits the right password
- **Then** the loader mounts after the 200 and the dashboard is revealed behind it

#### Rejected coach cannot log in (PAD-233)
- **Given** coach `rui` rejected with reason "not a coach"
- **When** they POST `/api/auth/login` with the right password
- **Then** the response is 403 `{"error": "COACH_REJECTED", "reason": "not a coach"}`

#### Inactive user login
- **Given** a user with status `inactive`
- **When** they attempt to login
- **Then** the response status is 401

### Notes
- Rate limiting: rule 7 (PAD-228, closes B-001).
- OPEN: No account lockout after failed attempts
