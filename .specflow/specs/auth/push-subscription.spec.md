---
id: auth.push-subscription
status: implemented
depends_on: [auth.login]
implements: ../../specs-business/auth/coach-relies-on-auth.business.md
governed_by: []
---

# auth.push-subscription


### Intent
Register browser push notification subscriptions for authenticated users.

### Entities
- **PushSubscription** (`push_subscriptions`): user_id (unique), subscription_json (VAPID payload)

### Rules
1. One subscription per user (upsert behavior)
2. `POST /api/auth/push_subscription` to register
3. `DELETE /api/auth/push_subscription` to unregister
4. Subscription registered on login via frontend `requestAndSubscribe()`

### Acceptance Criteria

#### Register push subscription
- **Given** an authenticated user
- **When** they POST to `/api/auth/push_subscription` with a valid VAPID subscription JSON
- **Then** the subscription is stored (or updated if existing)
- **And** push notifications can be sent to this user
