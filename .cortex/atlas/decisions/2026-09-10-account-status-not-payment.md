---
id: decision.2026-09-10-account-status-not-payment
title: The two "subscription" settings read account status; relabel them, keep their ids, add no payment model
date: 2026-09-10T02:30:00Z
---

# The two "subscription" settings read account status; relabel them, keep their ids, add no payment model

PAD-132 asked for payment state as an eligibility criterion and for the two shipped settings
that *look* like payment filters — the `subscription_status` invitation-group attribute and the
`excludeUnpaidSubscription` restriction — to be renamed to what they check. Both read
`users.status`, the account-activation enum (`inactive | active | disabled`) set by the
invite/activation flow. There is no payment or billing model anywhere in the product: no table,
no field, no spec.

**Decided (overnight wave 2, owner decision 2026-09-09):**

1. **No payment model is added.** Payment state as an eligibility criterion is out of scope for a
   model that does not exist; the eligibility picker keeps offering no payments attribute
   (`eligibility.rules` rule 5). If billing ever lands, it is its own product decision, not a
   field bolted onto `coach_in_player`.
2. **The copy says what the settings check**, on every surface both platforms render from the
   shared locales: "Account status" (group attribute), "Active account" (tiebreaker), "Exclude
   inactive accounts — don't invite students whose account is not active yet; this is account
   status, not payment" (restriction). The backend default labels match.
3. **The wire identifiers stay** (`subscription_status`, `excludeUnpaidSubscription`). They are
   stored inside every coach's saved `notification_configs` JSON and consumed by the engine, the
   invite simulation, the tiebreaker ranking, `@levelup/types` and both clients. Renaming them
   would be a data migration plus a compatibility shim in three packages for zero change in
   behaviour — exactly the "silently changing a configured setting" risk the ticket warned about.
   Code comments at each definition point say the id is a legacy name for account status.

**Consequence:** `notifications.config` rule 7c is closed; PAD-132 closes with this decision.
