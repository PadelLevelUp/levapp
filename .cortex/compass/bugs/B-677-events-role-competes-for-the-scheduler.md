---
id: B-677
title: "ROLE=events fell into the API branch of scheduler_mode(): an events process would compete for the scheduler lock (or write the job store)"
type: wrong-rule
severity: medium
status: resolved
affects:
  - delivery.worker-role
  - backend/padel_app/scheduler.py
proposed_fix: "scheduler_mode('events', any split) == off; worker-role rule 1's table and criterion say so."
opened: 2026-10-22T03:40:00Z
resolved: 2026-10-22T03:50:00Z
---

# B-677: an events process would run the scheduler

**Source:** found while designing PAD-697 (la-2110-SessionG, 2026-10-22). Ledger id from range
B-676–690 (unconfirmed). Not shipped: no environment runs `ROLE=events` yet.

**What happens:** `scheduler_mode(role, split)` returned `compete` for every role other than
`worker` when `WORKER_SPLIT` was off, and `client` when it was on. An events container would have
competed for the scheduler-leader lock with the API, or written the job store.

**What should happen:** an events process holds the live-update streams and nothing else, so no
scheduler in either mode (F, PAD-695's owner, agreed 2026-10-22).

**Evidence:** `delivery.worker-role` rule 1's criterion and `test_role_and_split_pick_the_scheduler_mode`
both pinned `events on → client`. That made it a rule that was wrong, not a code slip (type: wrong-rule).
The corrected rows `("events", True, "off")` and `("events", False, "off")` were red on staging's code
(client / compete) and green after the fix.

### Resolution

- Spec: delivery.worker-role rule 1 (table row and criterion).
- Test: test_pad695_worker_role.py truth table, two rows.
- Code: `scheduler_mode` returns `off` for `events`; the start-up log names the events case.
