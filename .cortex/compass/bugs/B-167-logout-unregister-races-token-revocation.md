---
id: B-167
title: "Logout's push-token unregister races the session revocation, so the phone keeps the old account's pushes"
type: missing-criterion
severity: high
status: resolved
affects:
  - messaging.push-notifications
  - frontend/apps/mobile/src/auth/AuthContext.tsx
  - frontend/apps/mobile/src/lib/push/expoPushRegistrar.ts
proposed_fix: "Logout awaits the push unregister (bounded by a timeout) before revoking the session and clearing the token; add the criterion; red-first ordering test."
opened: 2026-09-24T16:22:33Z
resolved: 2026-09-24T16:24:47Z
---

# B-167: the logout unregister races the revocation

**Source:** Session-D, 2026-09-24, while diagnosing the owner's build-24 report "a push tap opens the thread but it can't load" (PAD-408 family). The ticket is PAD-418. The id is from Session-D's range B-166–170. **Whether this caused the owner's report is not established**; that waits for the production logs and the owner's answers.

**What happens:**
- `logout()` (`AuthContext.tsx:163-176`) calls `getPushRegistrar().unregister()` fire-and-forget, then awaits `POST /auth/logout`.
- That call blocklists the access token (`api_auth.py:360-362`).
- `unregister()` (`expoPushRegistrar.ts:102-121`) sends `DELETE /notifications/device`, after awaiting `getDeviceToken()` when the token isn't cached.
- A DELETE that reaches the server after the revocation gets a 401, which the registrar swallows. The old account's `device_tokens` row stays, and the phone keeps receiving that account's pushes.

**What should happen:** rule 9, "the iOS app unregisters its token on logout, so a shared phone stops getting the previous user's pushes".

## Evidence
- Code reading, cited above.
- `src/auth/sign-out.test.ts`, the first case, run against a stub that copies today's order (fire-and-forget unregister, then revoke, then clear): **red**, `expected [ 'revoke', 'clear' ] to deeply equal [ 'delete', 'revoke', 'clear' ]`. The DELETE lands after the revocation, against a server that refuses it.
- Not reproduced on a device: the simulator has no real push token (`Device.isDevice` gate).

## Diagnostic tree
1. The dev spec `messaging.push-notifications` governs this. Yes.
2. Rule 9 covers logout unregistering. Yes.
3. Is the rule correct? Yes. Re-binding tokens server-side would reverse PAD-269's anti-hijack decision (an owner call; not taken).
4. Does a criterion cover it? **No.** The only token criterion is "Another user's device token is never taken over". **Missing criterion.**

Drift: none. The business spec says pushes reach the user they're for.

## Change plan (Type 1)
**Spec:** add a criterion.

#### Logout unregisters the push token before the session ends (PAD-418)
- **Given** a signed-in user whose phone registered push token T
- **When** they log out
- **Then** `DELETE /notifications/device {token: T}` completes with their still-valid session, **before** `/auth/logout` revokes it, so T's row for that user is removed
- **And** a hung or failed unregister never blocks logout for more than a few seconds

**Then:**
1. The test above is already written and red.
2. Fix: `src/auth/sign-out.ts` runs unregister (awaited, with a timeout), then revoke, then clear. `AuthContext.logout` uses it.
3. Mutants: drop the await, or the timeout. Then run the mobile suite and tsc.
4. Owner decision, noted and not done: phones already carrying a stale row stay stuck until the user logs in and out again with the fix, or until Expo reports `DeviceNotRegistered`. A cleanup would be an owner call.

### Resolution
- **Spec:** new criterion, "Logout unregisters the push token before the session ends (PAD-418)", under rule 9. The rule text is unchanged.
- **Code:** new \`frontend/apps/mobile/src/auth/sign-out.ts\` runs unregister (awaited, bounded at 3 s), then revoke (\`/auth/logout\`), then clears the stored token, each step best-effort. \`AuthContext.logout\` uses it.
- **Tests:** \`src/auth/sign-out.test.ts\` 3/3. It was red first against today's order (\`['revoke','clear']\` vs \`['delete','revoke','clear']\`). All three cells are proven by mutants: no await makes the ordering test red, no timeout makes the hang test time out, an unguarded revoke makes the failure test red. Mobile suite: 68 files, 621 passed. tsc: 0.
- **Follow-up (D135, same PR, after Session-B's review):**
  - \`/auth/logout\` accepts an optional \`{pushToken}\` and deletes the CALLER's row inside the same authenticated request (\`auth.logout\` rule 4). That removes the race rather than bounding it. It's backward compatible: no body behaves as before. The client sends the token from \`PushRegistrar.cachedToken()\` and keeps the separate unregister as the fallback.
  - \`/auth/logout\` is now bounded at 5 s too, since the API client has no timeout.
  - Tests: \`test_pad418_logout_drops_push_token.py\` 4/4, the two removal cells red first. The preservation cells were proven by a mutant with the caller filter dropped. The new sign-out cell "a hung revoke never blocks logout" was red first (timed out).
- **Not done (owner decision):** phones already holding a stale row keep it until that user logs in and out again with the fix, or until Expo reports the token as \`DeviceNotRegistered\`.
