---
id: B-526
title: "E2E US-58 timed out in CI waiting for the conversation detail: the wait was armed after the click, so a fast answer landed before it listened"
type: test-defect
severity: low
status: resolved
affects:
  - frontend/apps/web/e2e/messaging/direct-messages.spec.ts
proposed_fix: "Arm waitForResponse together with the action that triggers it (Promise.all), as US-59 already does since PAD-204."
opened: 2026-10-12T19:14:00Z
resolved: 2026-10-12T19:14:00Z
---

# B-526 — US-58 waited for a response it had already missed

**Source:** the e2e-subset CI runs on #703 (red on both tries) and #710 (run 38295070449). Diagnosed
by Session B during PAD-647.

**What happened:** US-58 clicked the "E2E Student" row and only then called `page.waitForResponse`
for `/api/app/conversation/<id>`. On a fast CI runner the response landed before the wait was
registered. The backend log shows `GET /api/app/conversation/1?limit=30` answering 200 at 19:07:36, yet
the wait timed out after 10 s ("page.waitForResponse: Timeout 10000ms exceeded", spec line 34).
Locally (a slower stack) it passed 6/6, so the race was won there.

**Root cause:** a wrong test, not a wrong app. US-59 in the same file had the same wait and was
fixed under PAD-204 by arming it with the click; US-58 never got that change.

**What should happen:** the wait is armed before the action that triggers the request.

### Change Plan

- In `direct-messages.spec.ts`, wrap US-58's click and its wait in one `Promise.all`.
- US-63's unread-count wait after `goto` gets the same treatment. It swallowed a miss with
  `.catch`, so it only cost time, but it is the same pattern in the same file.
- Other specs with a wait armed after its action are listed for the coordinator and are not changed
  here: `notification-engine/reminder-flow.spec.ts:284` (after a click, a miss swallowed by `.catch`)
  and `loading-states/ticket-pad-24-loading-states.spec.ts:143` (after a click, behind a held route).

### Resolution

- Tests modified: US-58 and US-63 in `direct-messages.spec.ts`.
- Resolved: 2026-10-12, in PR #710 (PAD-647).
