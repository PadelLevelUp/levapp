---
id: P-DELIVERY-6
title: "Staging keeps realistic data without slowing production"
status: draft
---
# Staging keeps realistic data without slowing production

## Outcome

Staging keeps testing against real-shaped data, and refreshing it no longer slows the live app: it is refreshed from the nightly backup at most once a day, and only when a newer backup exists (PAD-571).

- Staging data comes from the latest nightly backup, so it is about a day old while the backups run; an older backup is still loaded, with a warning.
- A backup that loaded cleanly is not loaded again, however many changes reach staging; one whose load or scrub failed is retried, and the owner can force a reload by hand.
- Routine deploys never read the live database to refresh staging; a copy from it happens only when the owner asks by hand.
- No student or coach on staging is identifiable: names, usernames, emails, phones, birth dates, messages, notes, evaluations and push tokens are rewritten on every load (PAD-606); the staff accounts, the clubs, the courts, the countries and the birth years stay. Testers sign in with known staging accounts and a shared password kept in the staging secrets.
- Refreshing staging never fails a deploy; a refresh that cannot finish is reported red on its own job and can leave staging empty or stopped until the next one.

It does not promise moving staging off the shared server.
