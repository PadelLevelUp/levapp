---
id: B-176
title: "PAD-191 E2E: the cleanup undo loop read 0 undo buttons before the validated list rendered"
type: test-defect
severity: low
status: resolved
affects:
  - frontend/apps/web/e2e/attendance/presences-validation.spec.ts
proposed_fix: "Before the loop, wait for the n undo buttons the run produced (undoAfter.nth(n - 1) visible); the guard's instant count read 0 in the render gap."
opened: 2026-09-23T09:25:44Z
resolved: 2026-09-23T09:30:38Z
---

# B-176 — the undo loop's instant guard skipped every undo (PAD-412)

**Source:** test failure, `presences-validation.spec.ts` › PAD-191 › "classes 2..N are disabled
while the run is in flight". It is intermittent, and it is why #405 was opened. #405 added a
15 s timeout, and the Coordinator ruled D126 that #405 is superseded.

**What happens:** the last assertion, `toHaveCount(n)` after the cleanup loop, fails with
`Expected: 3 · Received: 0`. The loop never undid a class, so a longer timeout cannot help.

**What should happen:** the cleanup undoes every class the run validated, so the fixture goes
back to its starting state (R-040).

**Root cause:** the test encodes the page's settling wrongly. The loop's guard is
`(await undoAfter.count()) > 0`, which reads the count at an instant. The undo buttons live in
the "validated this week" list. `PresencesPage.loadQueue` renders that list only after both
`getPendingValidation` and `getPendingValidationCount` resolve, and by then the pending cards
are already gone. So there is a gap in which the page shows neither. `attendance.validation`
rule 9 (undo reopens a class) is correct; the test is what's wrong.

**Evidence (Phase 1):**
- **Re-run at `eb89cfb45`:** 1 of 5 failed at the pinned line, with 15 s, at load ~19.
- **Instrumented 20× repeat on staging `8dc17185d`,** 2026-09-23 09:13–09:19 UTC. In the first
  failing repeat the queue response had arrived (`pending=0 validated=3`), but at the loop's
  start the page showed `undo=0 cards=0`; 1.5 s later it showed `undo=3`. The 12 repeats after
  it failed from the fixture left validated.
- **2×2 with a validated trigger** (`/pending_validation/count` delayed 3 s from before the run;
  it fired 4× per run):
  - old loop, trigger present: fails, `Expected 3 · Received 0`;
  - old loop, trigger absent: passes (7 of the first 7);
  - fixed loop, trigger present: passes 3/3;
  - fixed loop, trigger absent: passes 5/5.
- **Committed file at load ~40:** 7/7 for the file, and 10/10 for this test.
- Two earlier triggers did not reproduce it, and both were aimed wrongly. One delayed the list
  request after the run's refetch was already in flight. The other delayed a *request*, which
  the server then answered fresh.

**Affected specs:**
- Dev: `attendance.validation` (rule 9). No change needed.
- Business: none.

### Change Plan (Type 7: correct spec, wrong test)
1. In the test, wait for `undoAfter.nth(n - 1)` to be visible (15 s) before the loop. The loop
   is otherwise unchanged.
2. Run the file and the test repeated. The 2×2 above is the proof.
3. Record the correction in B-079, whose addendum had concluded "load, not a logic bug"
   (done on #405's branch, `5a8ef86b1`).

### Resolution
- Test changed: `presences-validation.spec.ts`, which now waits for the n undo buttons before
  the cleanup loop.
- Spec changes: none. Code changes: none.
- Resolved: 2026-09-23T09:30:38Z, commit `4bc2052eb` (PAD-412).
