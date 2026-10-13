---
id: B-581
title: "Two push-subscription saves at once for one user gave a 500 (UniqueViolation on ix_push_subscriptions_user_id); sign-in sent both"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-13T15:40:00Z
affects:
  - .specflow/specs/auth/push-subscription.spec.md
  - backend/padel_app/modules/notifications_api.py
  - frontend/apps/web/src/utils/pushNotifications.ts
proposed_fix: "Rule 7: the insert runs in a savepoint and a collision updates the winner's row (both 201, one row). Rule 8: the web client joins a save already in flight for the same token."
opened: 2026-10-13T15:00:00Z
---

# B-581: concurrent push-subscription saves 500

**Source:** prod, 2026-10-12 12:30Z (PAD-652). Two `POST /api/notifications/save-subscription`
for one user arrived together, and one answered 500.

**What happened:** `save_subscription` looked up the user's row and inserted one if it was missing.
When two requests both found nothing, both inserted, and the second failed on the per-user
unique index `ix_push_subscriptions_user_id` (notifications_api.py, at the commit). The pair came
from the web app itself: `login()` calls `requestAndSubscribe`, and `setToken` re-runs the token
effect in `AuthContext`, which calls it again. So every web sign-in sent two saves at once.

**What should happen:** both saves succeed and the user keeps one row (rule 7), and a sign-in
sends one save (rule 8).

**Evidence:** rule 1 said "upsert behavior" but had no criterion for two saves at once: Type 2,
incomplete rule.
- `test_pad652_save_subscription_race.py`, Postgres race cell (both requests held at their
  INSERT by a Barrier): red 3/3 on the old code with the prod error, green 3/3 on the fix.
- The forced-miss cell runs on any database: red on the old code (UNIQUE constraint failed),
  green on the fix.
- `pushNotifications.test.ts` "sends one save when sign-in asks twice at once": red on the old
  client (2 saves sent where 1 was expected), green on the fix.

### Change Plan
- Rules 7 and 8 and three criteria (done).
- Savepoint insert with a fall-back update in `save_subscription` (done).
- In-flight dedupe in `subscribeToPush` (done).
