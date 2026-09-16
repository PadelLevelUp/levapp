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
