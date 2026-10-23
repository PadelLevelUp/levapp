---
id: B-678
title: "Push registers only at launch and login: a later grant, a rotated token or a failed save leaves a student with no push channel, silently"
type: incomplete-rule
severity: high
status: resolved
affects:
  - messaging.push-notifications
  - auth.push-subscription
  - messaging.user-manages-unread-and-notifications
  - frontend/apps/mobile/src/lib/push/expoPushRegistrar.ts
  - frontend/apps/mobile/src/auth/AuthContext.tsx
  - frontend/apps/mobile/src/features/notifications/notifications-blocked-banner.tsx
  - frontend/apps/web/src/hooks/usePushNotifications.ts
  - frontend/apps/web/src/utils/pushNotifications.ts
proposed_fix: "Register without a prompt when permission becomes granted and on every foreground with no registration; send a rotated token; retry a failed save a bounded number of times; show a 'notifications not active, tap to enable' state on both clients instead of a console line."
opened: 2026-10-22T19:30:00Z
resolved: 2026-10-23T06:38:54Z
---

# B-678 — Push registers only at launch and login

*(Id unconfirmed: the highest id on any remote branch at filing was B-677.)*

**Source:** PAD-741's investigation (Session G), cause 2, filed as PAD-744.

**What happens:**
- **Production, counts only (2026-10-22, from PAD-741):** of the students who opened a conversation in the last 7 days, 33 have no iOS token and no web push subscription, and 19 have web push only. Every `POST /api/notifications/device` that reached the server in 14 days answered 200. So the failures happen before the request is sent, or the request is never sent.
- **iOS** (read in `origin/staging` bf0f2e99f):
  - `register()` runs only on a cold-start session restore and on login or sign-up (`AuthContext.tsx:103,148,163`). Nothing runs it when the app comes back to the foreground.
  - The Messages banner's "Ativar" calls `requestPermissionsAsync` and never `register()`. A student who grants permission there, or in iOS Settings, has no token until the next cold start. A suspended app can go days without one.
  - There is no `addPushTokenListener`, so a token iOS or Expo rotates is never sent.
  - A failure is one `console.warn("[push] register failed")`, with no retry and nothing on screen.
- **Web:**
  - `requestAndSubscribe` runs only at sign-in (rule 4).
  - The Messages page's state reads only the browser's own subscription (`pushManager.getSubscription()`), so a subscription the server no longer holds looks active.
  - `subscribe()` rejects unhandled when the save answers non-OK, so the banner stays as it was with no message.

**What should happen:** a device whose permission is granted ends up registered without a restart or a new login, a rotated token replaces the old one, and when registration has not worked the app says so and offers a tap that fixes it.

**Root cause (Type 2, incomplete rule):** `messaging.push-notifications` rule 9 makes registration happen "on every launch with a restored session and on every login", and `auth.push-subscription` rule 4 "on login". Neither spec has a rule for a permission granted later, the app returning to the foreground, a token rotation, or a failed registration. The code implements the rules faithfully.

**Evidence that selected the type:**
- the three call sites above, which are the only ones (`grep register(` in `apps/mobile/src`);
- no `AppState` and no `addPushTokenListener` in `src/auth` or `src/lib/push`;
- the banner's `request()` body;
- web's `isSubscribed`, read from `getSubscription()` only;
- the counts above, consistent with registrations never being sent.
- Not reproduced on a device: the simulator is reserved for the promotion gate (machine quiet). The new unit tests reproduce each path first; they fail on the old registrar.
- No recent change caused this. The registrar's last changes are PAD-418, PAD-307 and PAD-240; the gap has been there since PAD-168.

**Affected specs:**
- Dev: `.specflow/specs/messaging/push-notifications.spec.md`, `.specflow/specs/auth/push-subscription.spec.md`
- Business: `.specflow/specs-business/messaging/user-manages-unread-and-notifications.business.md` (no drift; it lacks the rule that a grant takes effect without a restart and that a device not receiving alerts says so)

### Change Plan

**Specs to modify:** `messaging.push-notifications` (new rule 15 and its criteria), `auth.push-subscription` (new rule 9 and its criteria), plus one business rule.

**messaging.push-notifications, new rule 15 (native):**
- Registration never prompts outside login, sign-up and the banner's tap.
- It runs without a prompt when the app returns to the foreground signed in with no registration this session, and right after the banner's grant.
- A rotated token (`addPushTokenListener`) is cached and sent.
- A failed registration is retried a bounded number of times, never after a denial, and stops at logout.
- The Messages banner gains a third state: permission granted but not registered, "notifications not active, tap to enable".

**auth.push-subscription, new rule 9 (web):**
- On focus and visibility, a signed-in browser with permission granted saves its subscription once per page session, subscribing first if it has none. The service worker has no JWT, so a browser-rotated subscription is re-sent at the next focus.
- A failed save sets a "not active" state on the Messages page with a tap that retries.
- `subscribe()` never rejects unhandled.

**Business rule:** a granted permission takes effect without restarting the app, and when alerts are not reaching this device the app says so and offers to turn them on.

**Then:**
1. Unit tests on the registrar, the banner and the web hook. They fail on the old code.
2. Fix the code on both clients.
3. Run the files touched and the three tsc commands (machine quiet); CI is the gate.
4. Maestro banner-grant flow when the simulator is free.

**Follow-up, PAD-746 (a separate ticket, by the coordinator's decision):** an engine-health count of active students with no push channel, and server-side logging of registration errors.

### Resolution

Executed on `feature/pad-744`. It is resolved when the PR merges and the Maestro banner-grant flow has run.
- **Spec changes:** `messaging.push-notifications` rule 15 and four criteria; `auth.push-subscription` rule 9 and two criteria; one business rule in `user-manages-unread-and-notifications`.
- **Tests added:**
  - `apps/mobile/src/lib/push/expoPushRegistrar.test.ts`: 10 tests on the registrar and startPushRecovery;
  - `notifications-blocked-banner.test.tsx`: 3 tests (component, under the harness);
  - `notification-banner.test.ts`: +1 test;
  - `apps/web/src/hooks/usePushNotifications.test.ts`: 3 tests.
  - Mutants that go red: no register on the banner's grant; a prompt on every path; no once-per-session guard on web.
- **Code:**
  - mobile: `registerIfPermitted()`, retries, a status the banner can read, and `watchTokenRotation()`, plus `startPushRecovery` mounted in AuthContext while signed in and the banner's grant and retry;
  - web: `savedThisSession()`, a focus/visibility re-save, `saveState`, a `subscribe()` that never rejects, and `push-inactive-banner`.

**Resolved (2026-10-23):** #818 merged into staging at 6de507eaa. Maestro flow 307 `push-grant-without-restart` passed with 51 steps completed and 0 failed (evidence in #818's body).
