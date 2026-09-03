---
id: auth.token-refresh
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/auth/coach-relies-on-auth.business.md
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

### Acceptance Criteria

#### Silent token refresh
- **Given** a user with a JWT expiring in 10 days
- **When** they make any authenticated API request
- **Then** the response includes an `X-New-Token` header with a fresh JWT
- **And** the frontend stores the new token
