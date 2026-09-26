---
id: B-187
title: "E2E US-376d reopened the class-evaluation row before today's record was read, so the held earlier-day card stayed"
type: test-defect
severity: low
status: resolved
affects:
  - evaluations.class-panel
  - frontend/apps/web/e2e/evaluation-tools/class-evaluations.spec.ts
proposed_fix: "US-376d retries close/reopen (toPass, 20 s) until the reopened row shows today's record alone, the spec's own statement (rule 5), instead of reopening once and hoping the re-read has landed."
opened: 2026-09-25T18:54:04Z
resolved: 2026-09-26T05:06:58Z
---

# B-187: US-376d reopened the row before today's record was read

**Source:** Session-B during PAD-452 and PAD-422 (full serial run at `4732da3d9`, and 1 in 3 on PAD-422's branch), under load ~300–600. Ticket PAD-455.

**What happens:** `class-evaluations.spec.ts` US-376d rates a participant whose latest record is from an earlier day, then closes and reopens the row and expects the earlier-day card to be gone. Intermittently it is still there: `class-eval-earlier-2`, Expected 0, Received 1, after 5 s.

**What should happen:** class-panel rule 5 (Q33, review F1): the card is held while the row is open, and the reopened row shows today's record alone, "which the next read returns".

**Root cause:** Type 7, the test. The app does what rule 5 says. Reopening releases and re-captures the hold (``useHeldWhile(…, open, `${id}:${open}`)``). If the class read carrying today's record has not landed when the row reopens, the row captures the earlier-day record, and F1's hold (nothing moves under the finger) keeps it while open. The test reopened once, straight after the PUT, with nothing waiting for that read; every assertion between the PUT and the reopen holds whether or not it has landed.

**Evidence (Phase 1)**, isolated stack `levelup_test_pad455`, `--workers=1`, staging `6d252a9f8`:
- Probe run: the row's class read issued at the tap answered after it with yesterday's record (`6/editable=false`), and the re-read the save triggered answered ~80 ms later with today's (`7/editable=true`). The reopen landing in between is the failure.
- Directed triggers, temporary `page.route` blocks and never committed. Trigger 1 delays the post-PUT class re-read by 4 s. Trigger 2 delays every class read by 1.5 s, so a read in flight at the tap answers after it.
  - Old test: red with trigger 1, red with trigger 2, and red without a trigger at the current load (the ticket's exact failure).
  - "Wait for any class read" before reopening: red with trigger 2 (it matched the in-flight stale read).
  - "Wait for the read whose body holds today's record": red with trigger 2. Playwright also sees a read that React Query cancels or applies later, so no network wait says when the panel's data is fresh.
  - **Fix**, retried close/reopen: green with trigger 1 and with trigger 2; the whole file 4 passed.
  - **Mutation**, the app's hold never released (`held: true`): the fixed test is **red** (`toPass` times out), so the retry does not mask a real regression.

### Change plan

**Test:** `frontend/apps/web/e2e/evaluation-tools/class-evaluations.spec.ts` US-376d, the final step: close/reopen inside `expect(…).toPass({ timeout: 20_000 })` with a 1 s per-try check. No spec or app change: rule 5 already says what the test now checks.

### Resolution

- Spec changes: none.
- Tests modified: US-376d (above).
- Code changes: none.
