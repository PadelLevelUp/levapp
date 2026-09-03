---
id: notifications.groups
status: implemented
depends_on: [notifications.config]
implements: ../../specs-business/notifications/coach-relies-on-notifications.business.md
governed_by: []
---

# notifications.groups


### Intent
Define student notification groups for organizing who gets notified.

### Rules
1. `notification_groups` in config: list of `{id, label, enabled}` groups
2. `invitation_groups`: rule-based groups with matching criteria
   - Each group has rules: `[{attribute, operation, value}]`
   - Attributes: level, side, subscription status, etc.
   - Operations: equals, not_equals, in, not_in
   - The `side` attribute with `same_as_vacancy` operation is inclusive of "both": a candidate passes when their side equals the vacancy side, OR the candidate's side is "both", OR the vacancy side is "both"/null (see notifications.invitations rule 4a)
3. Groups determine invitation round matching order
4. `GET /api/app/notify/groups` returns groups for a specific class instance
