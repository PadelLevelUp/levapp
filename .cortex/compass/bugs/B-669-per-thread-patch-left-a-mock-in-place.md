---
id: B-669
title: "Two race tests patched the senders inside each thread; threads leaving out of order restored a MagicMock as the original, so the real senders stayed mocked for every later test in the process"
type: test-defect
severity: medium
status: resolved
affects:
  - backend/padel_app/tests/test_pad540_never_filled_spots_start.py
  - backend/padel_app/tests/test_pad545_recompute_suggestions.py
proposed_fix: "Patch once on the main thread around starting and joining the racing threads, never inside each thread."
opened: 2026-10-22T19:55:00Z
resolved: 2026-10-22T20:10:00Z
---

# B-669: a race test's per-thread patch left the senders mocked for the rest of the run

**Source:** la-2110-SessionF, triaging #796 (PAD-699). Four tests in `test_pad699_push_outbox.py`
failed only on the Postgres shard 2 (runs 39832889821 and 39839476285); the file passed alone and
on SQLite.

**Evidence:** a probe fixture pushed in ad2a641b1 printed, for every test in the file from the
first one on: `environ={} unit_of_work_depth=0 stale_modules=[] sender=MagicMock threads=[]`.
`padel_app.utils.expo_push.send_expo_push_to_user` was already a `MagicMock` before the file
started. On SQLite the same probe printed `sender=function`.

**Mechanism:** `_race` in `test_pad540_never_filled_spots_start.py` (Postgres-only tests) ran two
threads, each with its own `with patch(A), patch(B), patch(C)` on the same module attributes.
`patch` saves the current value on enter and puts it back on exit. If thread 1 enters, then
thread 2 (which saves thread 1's mock as "original"), then thread 1 exits first, thread 2's exit
restores thread 1's mock, and it stays. `notification_service.publish`,
`send_push_notification` and `expo_push.send_expo_push_to_user` stayed mocked for the rest of the
shard. `test_pad545_recompute_suggestions.py`'s race had the same shape (`publish`,
`send_push_notification`, `_patched_io()`).

**Why test-defect:** the code under test is right; two tests corrupted shared process state.

### Resolution
- Both races now patch once on the main thread around starting and joining the threads.
- A test that relies on a real sender after a race no longer sees a mock.
- Lesson: never `patch()` a module attribute inside a thread that runs concurrently with another
  thread patching the same attribute; patch around the threads instead.
