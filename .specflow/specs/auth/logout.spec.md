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
   (user, token) row is touched here; registration then gives the token to whoever signs in next (`messaging.push-notifications` rule 9, D137). **Backward
   compatible:** App Store 1.0/1.1.0 post no body and see no change; a missing, empty or non-string
   `pushToken` is ignored. The mobile app still sends the separate unregister first, as a fallback.

5. **(PAD-591) The blocklist is read once per request.** Authenticating a request looks the token's
   `jti` up in `token_blocklist` once; a later step of the same request (the sliding refresh in
   `after_request`, the view-as gate) reuses that answer instead of querying again.

6. **(PAD-716) A session's cached data ends with it, on every client.** The web, iOS and Android
   clients keep server answers in a query cache (60 s fresh). Signing out, losing the session to a
   401, and signing in all clear that cache (`queryClient.clear()`), so the next account on the same
   device or tab never sees the previous account's profile, Settings sections, conversations,
   calendar or players. On sign-out the cache is cleared after the stored token is gone, so no
   in-flight read refills it with the old session. Privacy defect B-601 (Android nightly lane): a
   coach's Settings showed the student's sections for up to 60 s after the student signed out.

### Acceptance Criteria

#### One blocklist lookup per request (rule 5, PAD-591)
- **Given** a valid token issued 20 days ago (inside the sliding-refresh window)
- **When** it calls `GET /auth/me` under a statement recorder
- **Then** `token_blocklist` is queried exactly once and the response still carries the refreshed
  token

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

#### The next account starts with an empty cache (rule 6, PAD-716)
- **Given** a signed-in student whose `auth-me` and conversations are cached
- **When** they sign out (or a 401 ends the session) and a coach signs in on the same device or tab
- **Then** the query cache holds nothing of the student's, and the coach's Settings read their own
  `auth-me`
