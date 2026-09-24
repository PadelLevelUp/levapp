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

4. **The logout request may carry the device's push token (PAD-418, B-167).** An optional JSON body
   `{pushToken}` makes the server delete the CALLER's `device_tokens` row for that token in the same
   authenticated request, before the token is blocklisted, so a phone cannot stay on this account's
   pushes because a separate unregister lost the race with the revocation. Only the caller's
   (user, token) row is touched (`messaging.push-notifications` rule 9 stands). **Backward
   compatible:** App Store 1.0/1.1.0 post no body and see no change; a missing, empty or non-string
   `pushToken` is ignored. The mobile app still sends the separate unregister first, as a fallback.

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

#### Logout with the push token removes the caller's row (PAD-418)
- **Given** coach `coach1` registered `ExponentPushToken[pad418]`, and user `other418` registered the same token
- **When** `coach1` posts `/api/auth/logout` with `{"pushToken": "ExponentPushToken[pad418]"}`
- **Then** the response is 200 `{"message": "Successfully logged out"}`, `coach1`'s row for that token is gone, and `other418`'s row is untouched

#### Logout without a body is unchanged (App Store 1.0/1.1.0) (PAD-418)
- **Given** coach `coach1` registered `ExponentPushToken[pad418]`
- **When** `coach1` posts `/api/auth/logout` with no body
- **Then** the response is 200 `{"message": "Successfully logged out"}` and the row remains, exactly as before PAD-418
