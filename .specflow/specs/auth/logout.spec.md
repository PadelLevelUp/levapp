---
id: auth.logout
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/auth/coach-signs-in-and-stays-connected.business.md
governed_by: []
---

# auth.logout


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
