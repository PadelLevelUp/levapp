---
id: B-218
title: "E2E PAD-33 list test armed waitForResponse after beforeEach had already loaded the list (race)"
type: test-defect
severity: low
status: triaged
affects:
  - frontend/apps/web/e2e/messaging/message-timestamp-timezone.spec.ts
proposed_fix: "Arm the wait and trigger a fresh list read together (Promise.all with page.reload())."
opened: 2026-09-26T11:27:47Z
---

# B-218: the PAD-33 list test armed its wait after the load (PAD-456)

**Source:** Session-B during PAD-452 (2026-09-25): an ordered run on staging `86523d0bd` failed with `TimeoutError: page.waitForResponse: Timeout 10000ms exceeded` at the list test. Filed as PAD-456 with a pre-named B-188, which #464 used; this entry is B-218.

**Root cause (from the spec):** `beforeEach` opens Messages, which fires `GET /api/app/conversations`. The list test only then armed `waitForResponse`, so a list answer that landed first was missed. The message-thread test in the same file arms inside `Promise.all` with its click and is fine. Type 7, the test.

### Change plan
- Arm the wait inside `Promise.all` with `page.reload()`.
- Red first, with a directed trigger (not committed): wait until the list has rendered before arming. The old test then fails every time, and the new one passes.
- The 2×2 (old/new × trigger present/absent) and the spec ×3 once the machine is quiet (wave 8).

### Resolution
(pending the runs)
