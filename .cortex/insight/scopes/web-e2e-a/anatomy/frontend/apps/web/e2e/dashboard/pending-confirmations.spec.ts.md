---
path: frontend/apps/web/e2e/dashboard/pending-confirmations.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 3
size_lines: 97
size_tokens: 823
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f0bce113f6c4cfc76870b341ba32def6caecf2133e83fc8993a5efb752974b21"
---

## Purpose

PAD-78 coverage of pending-confirmation tracking and the manual
notify-the-pending action. The dashboard redesign replaced the dedicated
"pending confirmations" card and its button with the "needs you" queue, so
the UI assertions here only confirm the old card/button are gone and the
new queue renders; the underlying product behavior — a manual notify that
reaches only students who have neither confirmed nor declined for
tomorrow's classes — is still real and is covered at the HTTP layer
directly against `/api/app/dashboard/pending-confirmations/notify`.

## Main players

- `getToken(request, username, password)` (lines 29-38) — critical. POSTs
  to `/auth/login` and returns the access token, used by both
  request-only tests to call the notify endpoint directly.
- `bearer(token)` (line 40) — supporting. Builds the `Authorization:
  Bearer` header object.
- `"PAD-78: the pending-confirmations card is replaced by the needs-you
  queue"` (lines 44-58) — critical. UI test confirming
  `dashboard-pending-confirmations` no longer renders and
  `dashboard-needs-you` does.
- `"PAD-78: manual notify reaches only the still-pending students"` (lines
  60-71) — critical. Request-only test asserting `sent: 2` against the
  seeded "E2E Pending Confirm Class" (2 pending, 1 confirmed, 1 declined
  for tomorrow).
- `"PAD-78: manual notify is a no-op when nobody is pending"` (lines
  73-87) — supporting. Same endpoint called as the no-levels coach (no
  classes), asserting `sent: 0`.

## Insights

- This file is the canonical example of testing a feature's HTTP contract
  directly once its original UI surface is gone: the product behavior
  PAD-78 specified didn't disappear when the dashboard was redesigned,
  only its card did, so the spec keeps HTTP coverage for the endpoint
  rather than dropping it.
- The `sent: 2` / `sent: 0` counts are tightly coupled to the seed's "E2E
  Pending Confirm Class" fixture (tomorrow, 2 pending + 1 confirmed + 1
  declined) — changing that fixture's counts in `e2e/scripts/seed.py`
  breaks this file silently unless the assertions are updated in
  lockstep.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`, `COACH_USERNAME`, `COACH_PASSWORD`,
    `COACH_NOLEVELS_USERNAME`, `COACH_NOLEVELS_PASSWORD`.
  - `helpers/navigation.ts`: `openDashboard`.
  - `helpers/api.ts`: `API_ROOT`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/dashboard/navigation.spec.md`
  and `.specflow/specs/notifications/manual.spec.md` (the manual-notify
  behavior); shares the "E2E Pending Confirm Class" fixture with
  `availability/unavailable-student-notifications.spec.ts`'s
  time-slot-avoidance comments (this scope).

## Query pointers

- If you need to touch the pending-confirmations notify endpoint, also
  read: the backend notification service's manual-notify handler and
  `e2e/scripts/seed.py`'s "E2E Pending Confirm Class" fixture counts.
- If you need to understand the "needs you" queue replacement UI, read
  first: `dashboard/coach-dashboard.spec.ts` (this scope, `dashboard-needs-you`
  testid), then: the web dashboard block components (outside this scope).
