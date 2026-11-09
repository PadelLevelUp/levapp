---
id: auth.token-refresh
status: implemented
depends_on: [auth.login]
serves: [P-AUTH-2]
governed_by: []
---

# auth.token-refresh


### Intent
Silently refresh JWT tokens before they expire, avoiding forced re-login.

### Rules
1. On every API response, if the JWT expires in < 15 days, the backend issues a new token in the `X-New-Token` response header
2. Frontend axios interceptor reads `x-new-token` and updates localStorage
3. This is transparent — no explicit refresh endpoint needed for normal flow
4. An explicit `POST /api/auth/refresh` endpoint also exists
5. **No fresh token on the way out (PAD-269).** The logout and account-deletion responses never
   carry `X-New-Token`, and no response does for a token whose `jti` is already in
   `token_blocklist`. Before this, logging out could hand back a brand-new valid token.
6. **Absolute session cap (PAD-269).** Every access token carries an `auth_time` claim: the moment
   of the login (or sign-up) that started the session. Refreshing copies it unchanged. A token whose
   `auth_time` is more than `JWT_ABSOLUTE_SESSION_DAYS` (config, default 90) ago is refused like a
   revoked token (401) and is never refreshed, so a session in constant use still ends 90 days after
   its login. A token minted before this rule has no `auth_time`; its `iat` stands in, and the next
   refresh stamps that value, so existing sessions are capped from their next refresh.

### Acceptance Criteria

#### AUTH-TOKEN-REFRESH-1: Silent token refresh
- **Given** a user with a JWT expiring in 10 days
- **When** they make any authenticated API request
- **Then** the response includes an `X-New-Token` header with a fresh JWT
- **And** the frontend stores the new token

#### AUTH-TOKEN-REFRESH-2: Logout never returns a fresh token (PAD-269)
- **Given** a token that expires in 10 days (so any other response would carry `X-New-Token`)
- **When** its owner POSTs `/api/auth/logout`
- **Then** the response has no `X-New-Token` header

#### AUTH-TOKEN-REFRESH-3: A session ends 90 days after its login (PAD-269)
- **Given** a token whose `auth_time` is 91 days ago and whose `exp` is still in the future
- **When** it calls `GET /api/auth/me`
- **Then** the response is 401
- **Given** a token whose `auth_time` is 80 days ago and which expires in 10 days
- **When** it calls `GET /api/auth/me`
- **Then** the response is 200 and `X-New-Token` carries a token with the same `auth_time`

#### AUTH-TOKEN-REFRESH-4: The session cap counts from the login, also for older tokens, and follows the configured days (rule 6)
- **Given** a user who logs in
- **Then** the access token carries `auth_time`, the time of that login
- **And** a token issued before the claim existed is refreshed with its issue time as `auth_time`
- **And** with `JWT_ABSOLUTE_SESSION_DAYS` at `30`, a token whose `auth_time` is `31` days old answers 401
test: `backend/padel_app/tests/test_token_hygiene.py` › `test_login_token_carries_auth_time` (+2 more)
