---
id: B-286
title: "E2E: nav-unread-badge's PAD-149 test is order-dependent: red after other specs, green alone"
type: test-defect
severity: medium
status: open
affects:
  - frontend/apps/web/e2e/messaging/nav-unread-badge.spec.ts
proposed_fix: "Not decided: find what an earlier spec leaves behind that keeps the badge up (separate ticket). Type is provisional until then."
opened: 2026-10-03T11:15:00Z
---

# B-286: nav-unread-badge's PAD-149 test is order-dependent

**Source:** PAD-511 phase 0 (the PR E2E subset's measuring run) and the wave-11 release gate, both on
2026-10-03.

**What happens:** `e2e/messaging/nav-unread-badge.spec.ts:92` "PAD-149: opening the conversation
clears the nav unread badge without a reload" fails after other specs have run on the same seeded
database, at `:121`: `expect(getByTestId('nav-unread-badge')).toBeHidden()` with the message "the
nav badge must clear in-session" (10 s). The badge is still rendered. Run alone on a freshly reset
database, it passes.

**Evidence:**
- PAD-511 phase-0 run 37090127465, job "subset #528" (25 specs at #528's head 47a008834):
  94 passed, 1 failed, this test. The job's "Re-run red files alone" step ran the file alone after
  a reset: 1 passed (15.8 s).
- Release gate, staging 43525aeda, shard 2 (local log `wave11-43525aeda/shard-2.log:5350-5372`,
  `:6816-6818`): 1 failed, 135 passed (14.6 min), this test, the same assertion. Re-run alone
  (`shard-2-failure-alone.log:238`): 1 passed (14.4 s).
- Two different neighbour sets (a 25-spec subset; a gate shard of 136) and the same failure, so it
  is not one particular predecessor in one particular run.

**Root cause:** not investigated here: that is a separate ticket. Known: specs share one seeded
database, run serially (B-101), and this test reads the coach's unread count. The `test-defect`
type is provisional: if the investigation finds the app's badge failing to clear on a real state
an earlier spec leaves (for example a second unread conversation), it is a product defect and the
type changes.

**Effect on PAD-511:** recorded as a phase-0 finding on #534. Until fixed it is a candidate for
`e2e/pr-subset/quarantine.txt` before the subset can be a required check.

### Resolution

(open)
