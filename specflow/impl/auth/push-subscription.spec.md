---
id: auth.push-subscription
status: implementing
depends_on: [auth.login]
serves: [P-AUTH-2]
governed_by: []
---

# auth.push-subscription


### Intent
Register browser push notification subscriptions for authenticated users.

### Entities
- **PushSubscription** (`push_subscriptions`): user_id (unique), subscription_json (VAPID payload)

### Rules
1. One subscription per user (upsert behavior)
2. `POST /api/notifications/save-subscription` to register
3. `DELETE /api/notifications/unsubscribe` to unregister
4. Subscription registered on login via frontend `requestAndSubscribe()`
5. There is exactly **one** registration endpoint and no alias for it. A second
   route that upserts `push_subscriptions` is drift, not redundancy: two
   implementations of the same contract can diverge silently, which is what
   B-008 recorded.
6. The surviving path is `/api/notifications/save-subscription`, not the
   better-named `/api/notifications/subscribe`, because it is the only one any
   client has ever called (`frontend/apps/web/src/utils/pushNotifications.ts`;
   git history confirms the web app never called `/subscribe`). Renaming to the
   tidier path would break push registration for every already-cached web bundle
   and service worker, so the live contract wins over the nicer name. Native iOS
   is unaffected — it registers device tokens at `/api/notifications/device`,
   a separate contract.
7. Two saves for one user at the same moment both succeed and leave one row
   (PAD-652, B-581). Each looks for the user's row first; when neither finds it,
   both insert, and the second insert collides with the per-user unique index.
   The insert runs in a savepoint: on that collision only the savepoint rolls
   back, and the save updates the row the other request just wrote. The last
   write wins, and both answer 201. Prod had this on 2026-10-12: a 500
   (UniqueViolation on `ix_push_subscriptions_user_id`).
8. The web client sends one save per sign-in, not two (PAD-652). `login()` and the
   token effect both call `requestAndSubscribe`, so a second `subscribeToPush` for
   the same token while a save is in flight joins that save instead of sending
   its own. A call after the save has finished, or for a different token, sends
   a new one. Rule 7 still holds for any two clients that save at once, such as
   two tabs.

9. **A browser with permission keeps its subscription saved, and says when it could not (PAD-744,
   B-678).** Rule 4's sign-in save is not the only one. While signed in, when the page gains focus
   or becomes visible, a browser whose permission is `granted` saves its subscription once per page
   session, subscribing first if it has none. That covers a subscription the server dropped and one
   the browser rotated. The service worker has no JWT, so it does not re-send a rotated
   subscription itself; the next focus does. The save never prompts. A save that fails leaves the
   Messages page in a "not active" state: "Browser alerts aren't active" with a button that tries
   again (`data-testid` `push-inactive-banner`), instead of the generic "enable" prompt. The
   enable prompt (permission not yet decided) and the PAD-195 blocked banner (`denied`) are
   unchanged. `subscribe()` resolves `false` on a failed save and never rejects. Each failed save
   (`subscribe` = the browser's `pushManager.subscribe`, `post` = the save request) is reported to
   `POST /api/notifications/registration-failure` with the permission state, never the
   subscription (`admin.engine-health` rule 8, PAD-746); permission not granted reports nothing.
   Native's counterpart is `messaging.push-notifications` rule 15.
10. **The Messages page's push line is decided in one place (PAD-789).** Which line the web
    Messages page shows is one pure function of the browser's state, `messagesPushBanner({ready,
    isSupported, permission, isSubscribed, saveState})`, which `MessagesPage.tsx` calls instead of
    its three inline conditions: no Push API, or the browser's subscription not read yet (`ready`
    false) → none; `denied` → the PAD-195 blocked line (`push-blocked-banner`); `granted` and the
    save failed → the not-active line with its retry (`push-inactive-banner`, rule 9); not
    subscribed otherwise → the enable prompt, whose button is rule 4's user-gesture subscribe, and
    which gains the test id `push-enable-banner`; subscribed → none. Today's three conditions are
    already mutually exclusive; the function pins them in one testable place and, by waiting for
    `ready`, stops the enable prompt flashing on load in a browser that is already subscribed.
    The copy and the prompt site are unchanged. It is PAD-789's web half: a student whose browser
    holds no subscription is offered one on Messages. The iOS/Android counterpart is
    `messaging.push-notifications` rule 17.

### Acceptance Criteria

#### AUTH-PUSH-SUBSCRIPTION-1: Register push subscription
- **Given** an authenticated user
- **When** they POST to `/api/notifications/save-subscription` with a valid VAPID subscription JSON
- **Then** the subscription is stored (or updated if existing)
- **And** push notifications can be sent to this user

#### AUTH-PUSH-SUBSCRIPTION-2: Only one registration endpoint exists
- **Given** an authenticated user whose token would be accepted by the notifications blueprint
- **When** they POST to `/api/notifications/subscribe` with a valid VAPID subscription JSON
- **Then** the response is 404 (the route does not exist)
- **And** no `push_subscriptions` row is created or modified for that user

#### AUTH-PUSH-SUBSCRIPTION-3: Two saves at once keep one subscription
- **Given** an authenticated user with no push subscription
- **When** two POSTs to `/api/notifications/save-subscription` for that user reach their insert at the same moment
- **Then** both answer 201
- **And** the user has exactly one `push_subscriptions` row, holding one of the two subscriptions

#### AUTH-PUSH-SUBSCRIPTION-4: A save whose insert collides updates the existing row
- **Given** a user whose subscription row was written after this save looked for it
- **When** the save's insert collides with that row
- **Then** the response is 201 and the row holds this save's subscription

#### AUTH-PUSH-SUBSCRIPTION-5: Sign-in sends one save
- **Given** the web app with notification permission granted
- **When** sign-in calls `requestAndSubscribe` twice with the same token before the first save has answered
- **Then** exactly one POST to `/api/notifications/save-subscription` is sent

#### AUTH-PUSH-SUBSCRIPTION-6: Focus re-saves a granted browser's subscription once (PAD-744)
- **Given** a signed-in coach whose browser permission is `granted` and whose subscription the
  server does not hold
- **When** the tab gains focus twice
- **Then** one `POST /api/notifications/save-subscription` is sent, with no permission prompt

#### AUTH-PUSH-SUBSCRIPTION-7: A failed save shows the not-active banner with a retry (PAD-744)
- **Given** a signed-in coach whose browser permission is `granted`
- **When** the subscription save answers 500
- **Then** the Messages page shows `push-inactive-banner` with "Browser alerts aren't active", and its
  button saves again; no unhandled rejection is raised

#### AUTH-PUSH-SUBSCRIPTION-8: A save needs a session and a subscription (rule 2)
- **Given** a signed-in user
- **When** they POST `/api/notifications/save-subscription` with no `subscription` in the body
- **Then** the answer is 400
- **And** the same route with no session answers 401
test: `backend/padel_app/tests/test_pad173_single_subscription_route.py` › `test_save_subscription_rejects_missing_subscription` (+1 more)

#### AUTH-PUSH-SUBSCRIPTION-9: The Messages page shows exactly one push line per browser state, and none when push cannot work or is not known yet (rule 10, PAD-789)
- **Given** the browser states: no Push API; subscription not read yet (`ready` false); `default` and not subscribed; `granted`, not subscribed, save `idle`; `granted` and subscribed; `granted`, not subscribed, save `failed`; `granted`, subscribed, save `failed`; `denied`
- **When** `messagesPushBanner` decides the line
- **Then** they give none, none, `enable`, `enable`, none, `inactive`, `inactive` and `blocked`
- **And** `MessagesPage.tsx` takes its line from `messagesPushBanner` and renders `push-inactive-banner`, `push-enable-banner` or `push-blocked-banner` only for the matching result (a static check on the page's source, as the other `MessagesPage` tests are)
test: `frontend/apps/web/src/utils/messagesPushBanner.test.ts` › `each browser state gives one line, and none without a Push API or before the subscription is read` (+1 more)

### Today (PAD-789)
- The web Messages page decides its push line inline in `frontend/apps/web/src/pages/MessagesPage.tsx`
  (about lines 578–616): `push-inactive-banner` when supported, `granted` and `saveState === "failed"`;
  the enable prompt when supported, not subscribed, not `denied` and not failed; `push-blocked-banner`
  when supported and `denied`. Every line is gated on `isSupported`.
- The state comes from `frontend/apps/web/src/hooks/usePushNotifications.ts` (`isSupported`,
  `permission`, `isSubscribed`, `saveState`, `subscribe`); the save is
  `frontend/apps/web/src/utils/pushNotifications.ts:subscribeToPush`, which also holds
  `isIosBrowserWithoutApp()` (used by the setup guide only).
- Pinned today by `frontend/apps/web/e2e/messaging/push-denied-feed.spec.ts` (the blocked line) and
  `src/utils/pushNotifications.test.ts`; no unit test pins which line shows for which state.
- An iPhone-class student is offered the App Store by `mobile.install-suggestion`
  (`components/layout/InstallAppBanner.tsx`, `@levelup/config` `install-suggestion.ts`).

### Waves (PAD-789)
3. AUTH-PUSH-SUBSCRIPTION-9 — web `MessagesPage.tsx` (adds `push-enable-banner`) and a new
   `utils/messagesPushBanner.ts`; ships in
   one wave with `messaging.push-notifications`' MESSAGING-PUSH-NOTIFICATIONS-38.

### Open questions (PAD-789)
- **A student on an iPhone browser (outside an installed web app).** There the Push API is
  missing, so today's Messages page shows no push line at all, and the setup guide's `ios_browser`
  state (`dashboard.student-setup-guide` rule 7) is the only place that says so. Options: (a) no
  new line: `mobile.install-suggestion` already offers such a student the App Store listing on
  every page, and P-MOBILE-3 promises they "learn once" and that "dismissing hides it for 30
  days"; (b) a Messages line "no alerts in the iPhone browser, get the app" with the App Store
  link, which honours the install card's dismissal (`install-suggestion.ts`) and would need the
  server to say the student holds no native token, or it nags a student who already has the app.
  Decision (lead, 2026-11-25; the owner can reverse it): (a), because (b) reads as a second install nudge against P-MOBILE-3's "once", which is the
  owner's to change.

