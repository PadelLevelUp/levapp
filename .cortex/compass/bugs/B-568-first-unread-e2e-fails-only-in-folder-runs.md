---
id: B-568
title: "e2e/messaging/conversation-first-unread.spec.ts fails in a whole-folder run (at a different step each time) and passes alone"
type: test-defect
severity: medium
status: triaged
affects:
  - frontend/apps/web/e2e/messaging/conversation-first-unread.spec.ts
  - .specflow/specs/messaging/conversation-detail.spec.md
proposed_fix: "Not diagnosed. Start from the two traces below: decide whether the open's walk-back to the first unread races the list/SSE refetches a busy backend delays (product), or the spec's 20 s viewport wait and the login in beforeEach are too tight for a loaded folder run (test)."
opened: 2026-10-14T20:45:00Z
---

# B-568: conversation-first-unread fails only in folder runs

> Ledger id **unconfirmed** (wave-15 range B-568–580, la-1410-SessionD).

**Source:** PAD-648 verification, 2026-10-14 (la-1410-SessionD). Filed without a diagnosis on
the coordinator's instruction, "red on clean staging too → file and move on".

**What happens:** `npx playwright test e2e/messaging/ --workers=1` on an isolated stack fails one
test of this spec, at a different step each time. The same spec alone passes 3/3.

| Run | Commit | Result | Failure |
|---|---|---|---|
| folder, PAD-648 branch | c21b483ec | 47 passed, 1 failed | US-415a, line 145: `[data-msg-id="11"]` `toBeInViewport` → "viewport ratio 0" after 20 s |
| spec alone, PAD-648 branch | c21b483ec | 3 passed | — |
| folder, clean origin/staging | b96430e35 | 47 passed, 1 failed | US-415b: test timeout (180 s) exceeded in `beforeEach` (`loginAsCoach`, line 127) |

The spec runs third in the folder, before the PAD-648 spec, so that branch is not the cause.
The traces are under `test-results/messaging-conversation-fir-*` of each run; they were not kept.

**What should happen:** the spec passes in a folder run as it does alone, or it says why it needs
isolation.

**Why it matters:** the batch gate runs folders. A test that reds at random gets re-run until it is
green (memory: a green on an idle backend is a race won).
