---
id: B-284
title: "The reminder return locked the class before the returner's vacancy, opposite to every accept: a return and an invitee's yes on that vacancy deadlocked"
type: incomplete-rule
severity: medium
status: resolved
resolved: 2026-10-03T02:05:52Z
affects:
  - notifications.invitations
  - notifications.reminders
  - backend/padel_app/services/notification_service.py
proposed_fix: "The return takes the returner's own vacancy, then the class (rule 10's order), and records the reminder answer only after its own commit, so nothing commits inside the lock."
opened: 2026-10-03T02:05:52Z
---

# B-284: the reminder return locked in the opposite order

**Source:** PAD-499 review (#527 item 1). The coordinator filed it on 2026-10-03, and it is
fixed in the same PR.

**What the rule said:** PAD-261 (invitations rule 10) takes the vacancy lock and then the class
lock, in that order on every path, so that two deciders can never deadlock.

**What happened:** a student who had cancelled and then answered "yes" again (the return, PAD-313)
locked the class first. It then closed their own open vacancy, which writes that vacancy's row.
An invitee answering "yes" to the invitation for that vacancy locks the vacancy first and then
waits on the class. Each held what the other wanted, so Postgres aborted one of them with
`DeadlockDetected` and that student saw an error.

**Reproduced:** `test_return_and_an_invitees_yes_on_the_returners_spot_neither_deadlocks_nor_overfills`
(Postgres, forced: the return pauses holding its first lock until the invitee's answer is under
way). It was red with `DeadlockDetected` and is green after the fix (3/3 runs).

**The review's case (a):** a pending reminder on an absent student, whose answer committed inside
the class lock. This has no real path. A reminder "no" and a cancellation both answer the
reminder, and a coach re-add clears "absent". The reviewer reached it only by writing the status
directly. The return still records the reminder answer after its commit, so the case stays closed
if a path to it appears.

**Root-cause class:** a path that took rule 10's locks in its own order. Incomplete rule.

### Resolution

- The return calls `_lock_vacancy_and_instance(own vacancy, class)`.
- The reminder answer (`mark_responded` commits) is recorded after the return's one commit.
- The retired invitations' edits are queued before that commit (PAD-499's after-commit queue).
