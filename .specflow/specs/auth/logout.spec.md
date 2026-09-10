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
3. **The blocklist is pruned (PAD-269).** Each logout deletes `token_blocklist` rows older than the
   access-token lifetime plus one day: their tokens have expired, so the rows only slowed the
   per-request lookup.

### Acceptance Criteria

#### Successful logout
- **Given** an authenticated user with a valid JWT
- **When** they POST to `/api/auth/logout`
- **Then** the response status is 200
- **And** the JWT's `jti` is added to `token_blocklist`
- **And** subsequent requests with that token return 401

#### Logout prunes expired blocklist rows (PAD-269)
- **Given** a `token_blocklist` row created 40 days ago and one created yesterday
- **When** a user POSTs `/api/auth/logout`
- **Then** the 40-day-old row is gone, yesterday's remains, and the new `jti` is recorded
