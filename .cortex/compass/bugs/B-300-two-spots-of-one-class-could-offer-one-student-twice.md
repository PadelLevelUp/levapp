---
id: B-300
title: "Two spots of one class sending at once could offer one student two invitations: each sender locked only its own spot"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-03T16:20:04Z
affects:
  - notifications.invitations
  - backend/padel_app/services/notification_service.py
proposed_fix: "A sender takes its spot's lock and then the class lock per student (rule 10's one order, vacancy then class), so senders on two spots of one class decide one after the other."
opened: 2026-10-03T16:20:04Z
---

# B-300: two spots of one class could offer one student twice

**Source:** PAD-509, filed from the PAD-495 review (#526) and the rule 18 note that named it.
Session-E reproduced it on Postgres; Session-B fixed it.

**What the rule said:** invitations rule 18 (PAD-497/494): one live offer per student per class.

**What happened:** each sender re-checked a student under its OWN spot's lock (PAD-495). Two senders
on two different spots of one class hold two different locks, so both could pass the re-check for
the same free student before either had inserted its invitation. The student then held two live
offers for one class.

**Reproduced:** `test_pad509_two_spots_race.py` (Postgres, forced with a barrier after the first
re-check): red with `a student holds two live offers for one class`, 3/3 without the forced pause too.

**Root-cause class:** a check meant for the class, guarded by a lock of one spot. Incomplete rule.

### Resolution

- Per student, the sender now takes its spot's lock and then the class lock (`_lock_instance`), in
  rule 10's one order, and re-checks under both until the student's commit.
- No path takes the class lock and then waits for a vacancy's: the reconcile under the class lock
  takes vacancies only with `SKIP LOCKED`. So the new lock cannot deadlock against an accept.
- `test_pad509_lock_order.py` forces the one pair that could deadlock: an accept and a sender on
  the same spot. It is green with the fix and red with `DeadlockDetected` when the sender takes the
  class first.
- Dropping the class lock turns the reproduction red again.
