---
id: B-568
title: "e2e/messaging/conversation-first-unread.spec.ts fails in a whole-folder run (at a different step each time) and passes alone"
type: test-defect
severity: medium
status: resolved
affects:
  - frontend/apps/web/e2e/messaging/conversation-first-unread.spec.ts
  - .specflow/specs/messaging/conversation-detail.spec.md
proposed_fix: "Each test posts its batch before the coach signs in (no beforeEach login), so no coach page receives the batch's 40 SSE events. The other failure (US-415b, Playwright newPage hung 180 s) is the machine, not the spec."
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

## Diagnosis (2026-10-14, la-1410-SessionD)

Two different failures with two different causes.

1. **US-415a, "viewport ratio 0": the spec's race.**
   - The `beforeEach` signed the coach in, and only then the test posted its 40-message batch from
     the student. The coach's open page took 40 SSE `message_created` events, and the backend log
     of the failing run shows 40 `unread_count` refetches during the seeding.
   - Under a loaded folder run those events were still landing after the thread opened. Their
     arrivals and the list refetches (an open thread marks each arrival read) moved the thread off
     its first unread.
   - The spec alone, on an idle backend, won that race.
2. **US-415b, a 180 s timeout in `beforeEach`: the environment.**
   - The trace shows Playwright's `Create page` (browser.newPage) hanging for the full 180 s
     before any app code ran.
   - The backend received no request in those three minutes, and the browser took 30 s to close
     afterwards.
   - The load was about 300, so the machine's I/O state is a likely cause. Any test could hit
     this; nothing in this spec can fix it.

**Fix:** no `beforeEach` login. Each test posts its batch first and then calls `signIn`, so no coach
page is open while the batch is posted.

**Proof:** three `e2e/messaging/` folder runs in a row on origin/staging b96430e35 plus the fix, on
an isolated stack: 49 passed, 49 passed, 49 passed (7.5, 7.7 and 9.6 min). The 1-minute load at each
start was 334, 269 and 283, the conditions of both failing runs.

