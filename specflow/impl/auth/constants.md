---
constants:
  WEB_PUSH_SUBSCRIPTIONS_PER_USER: 5
---

# auth constants

- `WEB_PUSH_SUBSCRIPTIONS_PER_USER`: the most browsers one user keeps subscribed to web push
  (`auth.push-subscription` rule 1; owner, 25 Nov 2026, PAD-753). A save beyond it evicts the
  user's least recently updated subscription.
