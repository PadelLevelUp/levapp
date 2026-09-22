---
id: B-129
title: "A push-sender test timed the caller against a 0.25 s wall-clock budget, so a slow CI runner failed it for reasons unrelated to the code"
type: test-defect
severity: medium
status: resolved
affects:
  - backend/padel_app/tests/test_pad294_push_sender.py
proposed_fix: "Prove 'returns before the push round trip' by ordering against a fake push that blocks on an Event the test releases only after the engine has returned; no wall-clock budget."
opened: 2026-09-22T00:09:42Z
resolved: 2026-09-22T00:16:35Z
---

# B-129 — a push-sender test timed the caller against a wall-clock budget

**Source:** Session-D, reading #356's Postgres CI log (job started 2026-09-21 21:46 UTC):
`test_pad294_push_sender.py::test_a_system_message_returns_before_the_push_round_trip` failed with
`elapsed = 0.383` against `assert elapsed < 0.25`, while the identical merge passed on #355 and
#357. Assigned by the Coordinator on 2026-09-22. Ticket PAD-395. Ledger number from Session-B's
reserved range (B-125–134), assigned by the Coordinator.

**What the test claims.** PAD-294's criterion: a slow push service does not hold the engine —
`_send_system_message` returns before the push round trip completes, because the push runs on
the sender's worker thread.

**How it proved it, and why that is a defect.** A fake `requests.post` slept 0.3 s and the test
timed the call with `perf_counter`, asserting under 0.25 s. The budget measures the RUNNER as much
as the code: a loaded CI box, a Postgres lane doing real migrations, a GC pause, another job on
the machine — any of them can put the caller over 0.25 s while the engine still did exactly the
right thing. 0.383 s was that. The test cannot tell "the engine waited for the push" from "the
runner was slow", so a red from it is not a regression signal, and the two sibling jobs passing
the same code is the tell. B-100's family: a wall-clock quantity where a logical one was meant.

**Fix (test only, PAD-395).** The claim is proven by ORDERING. The fake push blocks on a
`threading.Event` that the test sets only AFTER the engine has returned. The test asserts, once
the call is back: the push is pending on the worker, the worker has started it, and nobody has
finished it; then it releases the Event and flushes. If the engine ever waited for the push, the
call could not return until the Event was set — and the Event is set only after the call returns —
so the test fails instead of passing. It cannot hang: the fake's wait is bounded (10 s) and the
`push_started` wait is bounded (5 s), so a wrong engine fails at the first assertion after ~10 s.

**Runs (Session-B, 2026-09-22, `origin/staging` `589f1977d`, sqlite, times from `date -u`):**
the file → 6 passed (00:15:24Z). Mutant, the push forced onto the caller's thread
(`PUSH_SENDER_INLINE = True`) → 1 failed in 10.68 s, "the push was not handed to the worker"
(started 00:16:21Z, finished before 00:16:35Z); restored → 6 passed. Not run: the Postgres lane
locally (CI is that), the full suite.

**The general rule (R-034's spirit):** when a test's subject is "A finishes before B", assert the
order with a synchronisation primitive the test controls; never a budget in seconds. A budget is
right only when the seconds ARE the requirement (an SLA), and then it must be wide enough that
only the code can miss it.
