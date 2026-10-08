---
id: B-322
title: "Creating an absent player's vacancy committed inside its class lock when the coach had no settings row, ending the lock before the vacancy was inserted"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-08T10:49:58Z
affects:
  - notifications.invitations
  - backend/padel_app/services/notification_service.py
proposed_fix: "Read (or create) the coach's NotificationConfig before taking the class lock, so the locked section's only commit is the one that inserts the vacancy."
opened: 2026-10-08T10:49:58Z
---

# B-322: vacancy creation committed inside its class lock

**Source:** PAD-541 (0710-SessionB, 2026-10-08), found by its Postgres race cell. Numbering in
0710-SessionB's range.

**What the spec says:** `notifications.invitations` rule 10: vacancy creation for a departing
player happens under the class lock, re-checked, so concurrent creators see each other's spot.
Rule 14 (PAD-303): one open vacancy per departing player per occurrence.

**What happened:** `_create_vacancy_for_absent_player` took the class lock, then called
`get_or_create_config`. For a coach with no `notification_configs` row, that `.create()` commits
and ends the lock before the vacancy is inserted. A second creator then got the lock and did not
see the first spot:
- Two different leavers' spots both took the same balancing side (PAD-541's race cell: two
  `right` instead of `right` + `left`, 3 of 3 runs on Postgres).
- Two concurrent absences for ONE player could both pass the "no open vacancy yet" re-check, and
  the database's unique index would refuse the second with an IntegrityError.

**Why it was latent:** it needs a coach whose settings row does not exist yet. Most coaches gained
one on their first settings read, before any cancellation.

**Fix:** the config is read before the lock. The race cell passes 3 of 3, and goes red 2 of 2 with
the config read moved back inside the lock.
