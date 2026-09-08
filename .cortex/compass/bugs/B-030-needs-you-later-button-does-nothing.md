---
id: B-030
title: "\"Mais tarde\" on a needs-you empty-seats card does nothing on web and iOS"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - dashboard.blocks
  - frontend/apps/web/src/components/dashboard/coach/NeedsYouQueue.tsx
  - frontend/apps/mobile/src/features/dashboard/blocks.tsx
  - backend/padel_app/helpers/dashboard/coach_home.py
proposed_fix: "Give the button a rule (3c) and a server-side snooze: POST /api/app/dashboard/needs-you/<itemId>/snooze hides the occurrence for 24h per coach; both shells call it and refetch."
opened: 2026-09-07T00:00:00Z
resolved: 2026-09-07T00:00:00Z
---

# B-030 — "Mais tarde" on a needs-you empty-seats card does nothing on web and iOS

**Source:** human report with an iOS screenshot (coach home, "Precisa de ti · 4", three
"tem N vagas livres" cards each with *Convidar N jogadores* / *Mais tarde*), 2026-09-07.

**What happens:** tapping *Mais tarde* does nothing. The card stays, the count stays.

**What should happen:** the card leaves the queue for a while and the count drops, on every
device the coach uses.

**Root cause:** Type 2 — incomplete rule. `dashboard.blocks` rule 3 describes the `empty_seats`
item and its `href`, and the redesign shipped the card with a secondary *Later* button on both
shells — but no rule ever said what *Later* does, so neither shell wired it. Web rendered
`<Button variant="outline">` with no `onClick`; iOS rendered `<Button variant="outline">` with
no `onPress`. There was no endpoint and no storage for a snooze. The business layer's own rule —
"a card is never made clickable unless a matching page actually exists to receive the click" —
was already being violated by a control that looked live and was not.

**Evidence:**
1. `frontend/apps/web/src/components/dashboard/coach/NeedsYouQueue.tsx` (`EmptySeatsCard`): the
   *Later* button had no handler; the *Invite* button next to it navigates.
2. `frontend/apps/mobile/src/features/dashboard/blocks.tsx` (`QueueItem`, `empty_seats` branch):
   same shape, no `onPress`.
3. `grep -ri snooze backend/padel_app` found only the unrelated replacement-approval "dismiss".

**Affected specs:**
- Dev: `.specflow/specs/dashboard/blocks.spec.md` — rule 3 gains 3c and five criteria.
- Business: `.specflow/specs-business/dashboard/user-relies-on-the-dashboard.business.md` — a
  business rule and journey step 4a, since a coach can now see and rely on the behaviour.

### Change Plan

**Spec to modify:** `.specflow/specs/dashboard/blocks.spec.md`
**Change type:** add rule 3c + criteria (both layers)

1. Rule 3c: `POST /api/app/dashboard/needs-you/<itemId>/snooze`, coach only, 24 hours, stored
   per coach + item in `needs_you_snoozes`, filtered out of `empty_seats` and `count` while live.
2. Backend: model + idempotent migration (`c144c9f02098`), `helpers/dashboard/snooze.py`,
   filter in `_empty_seat_items`, route at the end of `frontend_api.py`.
3. Shared: `dashboardApi.snoozeNeedsYouItem`, `useSnoozeNeedsYouItem` in `@levelup/hooks`.
4. Web: `EmptySeatsCard` calls the API, disables while in flight, refetches via the queue's
   existing `onAnswered`, toasts on failure. iOS: `EmptySeatsCard` uses the hook (invalidates
   the dashboard query), same disable + toast.
5. Tests: `backend/padel_app/tests/test_dashboard_needs_you_snooze.py` (six), E2E
   `dashboard/coach-dashboard.spec.ts` "Later" case.

### Resolution

Implemented as planned on `feature/needs-you-snooze` (2026-09-07). Backend suite for the
dashboard is green; web and mobile typecheck; unit suites green; E2E case added.
