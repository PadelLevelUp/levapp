---
id: B-527
title: "Two E2E specs started waitForResponse after the click that sends the request; one swallowed a miss, so its check could run before the answer existed"
type: test-defect
severity: low
status: resolved
affects:
  - frontend/apps/web/e2e/notification-engine/reminder-flow.spec.ts
  - frontend/apps/web/e2e/loading-states/ticket-pad-24-loading-states.spec.ts
proposed_fix: "Start each wait before or together with the action that sends its request, and let a miss fail instead of swallowing it."
opened: 2026-10-12T20:14:00Z
resolved: 2026-10-12T20:14:00Z
---

# B-527 — waits armed after their action

**Source:** the sweep that followed B-526 (Session B, during PAD-647). The coordinator asked for
these two to be fixed in their own PR.

**What happened:** B-526's race (the response lands before a wait registered after the click can
see it) also existed in two other specs:

- `reminder-flow.spec.ts` (around line 284) clicked the student's "No" and then waited for
  `/api/app/notify/respond`, with `.catch(() => null)`. A fast answer was missed and the miss was
  swallowed, so the "no error shown" check could run before the answer existed: the test passes
  without proving anything.
- `ticket-pad-24-loading-states.spec.ts` (around line 143) waited for `/api/app/remove_class` after
  the clicks that send it. The test's own route holds the answer for 800 ms, so the wait usually
  won, but only by that margin.

**Sweep:** every `waitForResponse` in `frontend/apps/web/e2e` was checked. That covers the ones
awaited directly and the 95 stored in a variable first. No other wait starts after the action that
sends its request.

### Change Plan

- reminder-flow: run the wait and the click in one `Promise.all`, with no `.catch`, so a miss fails.
- loading-states: store the wait before the delete click (the request can come from the button or
  from either dialog), and await it at the end.

### Resolution

- Tests modified: the two specs above. No app code changed.
- Resolved: 2026-10-12, in PR fix/b527-waits-armed-before-action.
