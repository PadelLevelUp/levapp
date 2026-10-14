---
id: B-530
title: "E2E: findClassOnCalendar's rescan waited for a calendar request on weeks react-query serves from cache, so every 'class is absent' check timed out on the base"
type: test-defect
severity: medium
status: resolved
resolved: 2026-10-14T19:45:00Z
affects:
  - frontend/apps/web/e2e/helpers/calendar-navigation.ts
  - frontend/apps/web/src/components/calendar/CalendarToolbar.tsx
proposed_fix: "goToPreviousWeek waits for the toolbar week label (calendar-week-label) to change, not for a request; the card wait that follows covers the render."
opened: 2026-10-14T19:20:00Z
---

# B-530: the previous-week step waited for a request a cached week never makes

**Source:** found by la-1410-SessionB while running the student-calendar E2E specs for PAD-664;
id from B's wave-15 range. Not caused by PAD-664: red on a clean base.

**What happens:** `findClassOnCalendar` scans forward, then, when the class was not seen, walks
back over the same weeks with a longer budget (the slow-render rescan). `goToPreviousWeek` waited
for `GET /api/app/calendar?from=…` after each click, but those weeks were loaded moments earlier
and react-query serves them from its cache without a request, so the wait timed out after 10 s.
Every caller that asserts the class is ABSENT walks the rescan to the end:
`notification-engine/open-spot-visibility.spec.ts:54` (PAD-130) and
`schedule-calendar/pad335-delete-materialised-one-off.spec.ts:167`.

**Evidence (2×2):**
- Base, clean `origin/staging` d1ab64866, own isolated stack (`levelup_e2e_1410b2`, :5148/:8148):
  `open-spot-visibility.spec.ts` with `--repeat-each=2` gave 2 failed, both at
  `TimeoutError: page.waitForResponse … at goToPreviousWeek … open-spot-visibility.spec.ts:54`.
  The same run on feature/pad-664 also failed 2/2.
- Fix, same stack: `open-spot-visibility`, `pad335-delete-materialised-one-off` and
  `class-evaluations` (the other `goToPreviousWeek` caller, which walks into uncached past
  weeks), with `--repeat-each=2`, gave 14 passed.

**Fix:** the toolbar's week heading carries `data-testid="calendar-week-label"`;
`goToPreviousWeek` clicks and waits for the label to change. That happens whether or not a
request is made. `goToNextWeek` is unchanged: its forward pass always reaches weeks not yet
loaded.
