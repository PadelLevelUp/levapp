---
id: P-DELIVERY-6
title: "Staging keeps realistic data without slowing production"
status: draft
---
# Staging keeps realistic data without slowing production

## Outcome

Staging keeps testing against real-shaped data, and refreshing it no longer slows the live app: it is refreshed from the nightly backup at most once a day, and only when a newer backup exists (PAD-571).

- Staging data is at most about a day old, from the latest nightly backup.
- The same backup is loaded into staging at most once, however many changes reach staging.
- Routine deploys never read the live database to refresh staging; a copy from it happens only when the owner asks by hand.
- Nothing on staging identifies a real person: names, usernames, emails, phones, birth dates, messages, notes, evaluations and push tokens are rewritten on every load (PAD-606). Testers sign in with known staging accounts and a shared password kept in the staging secrets.
- Refreshing staging never fails a deploy.

It does not promise moving staging off the shared server.
