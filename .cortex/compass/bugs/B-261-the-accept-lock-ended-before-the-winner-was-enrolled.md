---
id: B-261
title: "The accept path released the class lock before the winner was enrolled: a second yes on another spot could overfill the class"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-02T18:08:30Z
affects:
  - notifications.invitations
  - backend/padel_app/services/notification_service.py
  - backend/padel_app/services/class_join_request_service.py
  - backend/padel_app/services/lesson_service.py
proposed_fix: "Close the vacancy, confirm the winner and enrol them in ONE commit: _close_vacancy retires invitations with flushes and the retired messages' edits are queued before that commit and sent by it; the reconcile run by the enrolment counts every open vacancy and locks only the one it closes, with SKIP LOCKED."
opened: 2026-10-02T18:08:30Z
---

# B-261: the accept lock ended before the winner was enrolled

**Source:** PAD-499, filed from PAD-495 items 1 and 6. Session-B found it during PAD-493 (#507), and
the coordinator filed it on 2026-10-02.

**What the rule said:** PAD-261 (invitations rule 10) decides a "yes" under the vacancy-then-class
lock and holds the lock until the enrolment commits.

**What happened:** `_close_vacancy` retired the other candidates' invitations through
`_retire_invite_message`, and each message's `save()` committed. So the lock ended after the vacancy
was closed and before `_add_player_to_instance` enrolled the winner.

**Reproduced** in `test_pad499_accept_lock_ends_early.py`:

- **Cell (a), Postgres, forced interleave.** The class has 2 places, 1 enrolled, and two open
  vacancies (a stale extra one, prod class 367's shape). X's "yes" on V1 closes V1, and that close
  commits and releases the locks. Y's "yes" on V2 then takes the class lock, sees room, enrols and
  commits. X then enrols: **3 students on 2 places.**
- **Cell (b), SQLite and Postgres.** The enrolment raises after the close. On retry the student is
  told "confirmed" (since PAD-493 confirms before the close) and holds no place. On staging the same
  failure answered "spot filled" for the spot they had won.

**Production (read-only, coordinator, 17:46Z):** no class past or future holds more than its places,
and no confirmed invitation lacks its enrolment. The window was real but never hit.

**Root-cause class:** a lock that ends early because a helper commits mid-operation. Rule 10 promised
one commit and the code did not keep that promise. Incomplete rule.

### Change Plan

- **Spec:** rule 10 states the one commit, the deferred publishes and `SKIP LOCKED` in the
  reconcile.
- **Code:**
  - `_retire_invite_message(defer=True)` flushes and publishes nothing.
  - `_close_vacancy` always defers.
  - `_publish_retired(events)` builds the edits from the flushed state and queues them on the
    session (`padel_app/tools/after_commit.py`). The queue runs right after the next commit and is
    dropped by a rollback. So each caller queues BEFORE its own commit: the student accept, the
    coach accept, `_fill_from_waiting_list`, the join-request accept, the reminder return, `enrol`'s
    return, the coach's attendance return, and `reconcile_vacancies`. (Queued after a commit, an
    edit waited for whatever committed next, or was never sent. The first version did that on the
    coach accept and the reconcile; `test_pad499_publish_after_commit.py` keys each path's edit to
    the commit that closed the spot.)
- **Found while fixing:** holding the lock through the enrolment made PAD-495 item 7's inferred
  deadlock real. The enrolment's `reconcile_vacancies` updated another vacancy that a concurrent
  answer had locked while that answer waited for the class lock. The reconcile now selects the
  vacancies it may close `FOR UPDATE SKIP LOCKED`. One that another answer holds is left to it; that
  answer finds the class full and refuses, and the tick reconciles it. (#527 item 5.) It counts
  every open vacancy but locks only each one it is about to close. A pick another answer holds is
  passed over for the next. Locking them all had held spots it would not close, and counting only
  the ones it got left a stale vacancy behind once the held one was filled.
- **Tests:** cells (a) and (b), red on `0ae8b0ade`, green after (3/3 runs on Postgres).
  A commit put back inside `_close_vacancy` (by restoring the committing retire) fails 9 tests
  on Postgres: cells (a), (b) and (b2), and the coach, join and waiting-list cells.

### What is one commit, and what is not

The spot's close, the winner's confirmation and their enrolment are one commit on every accept
path. What follows that commit is bookkeeping in commits of its own, and is not covered:

- **Waiting-list fill:** the entry's `is_active = False` and the standing credit
  (`_fill_from_waiting_list`).
- **Join accept:** the request's `accepted` status, the standing credit, and the messages to the
  candidates.

If one of these later commits fails, the student keeps the place and the bookkeeping is stale.
For example, a waiting-list entry stays active for a student who is already enrolled.

**Duplicate edits on the join accept (read in the code, not run):** `_broadcast_spot_filled` edits
each retired candidate's bubble again (response `spot_filled`) and publishes it, after the queued
edit from the close. Each candidate's client receives two `message_edited` events for one bubble,
and the second one carries the final state. The student accept uses the same broadcast.

### Resolution

Fixed in PAD-499's PR, stacked on PAD-497 and PAD-495. If the single commit fails, the student sees
the error, and nothing has changed: the vacancy is open, the invitation is live and they are not
enrolled. They can answer again. Cell (b) proves this.
