---
id: auth.push-subscription
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/auth/coach-signs-in-and-stays-connected.business.md
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

### Acceptance Criteria

#### Register push subscription
- **Given** an authenticated user
- **When** they POST to `/api/notifications/save-subscription` with a valid VAPID subscription JSON
- **Then** the subscription is stored (or updated if existing)
- **And** push notifications can be sent to this user

#### Only one registration endpoint exists
- **Given** an authenticated user whose token would be accepted by the notifications blueprint
- **When** they POST to `/api/notifications/subscribe` with a valid VAPID subscription JSON
- **Then** the response is 404 (the route does not exist)
- **And** no `push_subscriptions` row is created or modified for that user

#### Two saves at once keep one subscription
- **Given** an authenticated user with no push subscription
- **When** two POSTs to `/api/notifications/save-subscription` for that user reach their insert at the same moment
- **Then** both answer 201
- **And** the user has exactly one `push_subscriptions` row, holding one of the two subscriptions

#### A save whose insert collides updates the existing row
- **Given** a user whose subscription row was written after this save looked for it
- **When** the save's insert collides with that row
- **Then** the response is 201 and the row holds this save's subscription

#### Sign-in sends one save
- **Given** the web app with notification permission granted
- **When** sign-in calls `requestAndSubscribe` twice with the same token before the first save has answered
- **Then** exactly one POST to `/api/notifications/save-subscription` is sent
