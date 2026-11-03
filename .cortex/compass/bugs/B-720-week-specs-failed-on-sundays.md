---
id: B-720
title: "Five calendar and picker E2E specs failed every Sunday: they counted weeks from Monday while the app's weeks start on Sunday"
type: test-defect
severity: medium
status: resolved
affects:
  - calendar.view
  - frontend/apps/web/e2e/players/add-to-classes.spec.ts
  - frontend/apps/web/e2e/players/add-to-classes-week.spec.ts
  - frontend/apps/web/e2e/schedule-calendar/class-date-prepopulate.spec.ts
  - frontend/apps/web/e2e/schedule-calendar/class-overlap-warning.spec.ts
  - frontend/apps/web/e2e/schedule-calendar/pad371-event-single-occurrence.spec.ts
proposed_fix: "Count weeks in the specs with the app's own WEEK_STARTS_ON (e2e/helpers/app-week.ts): click Next week as many times as the target is away (0 on a Sunday for the seed's Monday), and pin the browser to E2E_SEED_TODAY when it is set so a run can be reproduced on any weekday."
opened: 2026-11-01T14:52:49Z
---

# B-720: five week specs failed on Sundays

**Source:** Linear PAD-811. Found by the promotion 31 Playwright gate, which ran on Sunday 2026-11-01 (shard 3: 5 failed).

**What happens:** on a Sunday, five specs land a week too far:
- the add-to-classes picker (two specs);
- the mobile Add-class date;
- the overlap warning;
- the PAD-371 single-occurrence delete.

On Monday to Saturday they pass.

**What should happen:** they pass on every weekday, because they reach the week that holds their target date.

**Root cause:** a test defect, not an app defect. PAD-682 made the app's weeks start on Sunday (`calendar.view` rule 5a). The seed still puts the academy class on the first Monday after today, and the specs still assumed that Monday is always in the next week. So they clicked "Next week" once, or built "this week's Monday" Monday-first. On a Sunday that Monday is tomorrow, inside the week already on screen. The app was right in every case: for example, the mobile spec expected 11-04, but the Wednesday of the next Sunday-start week is 11-11.

**Evidence:** on staging 953b5cc39, on a real Sunday (2026-11-01 14:51:13–14:52:49Z, `E2E_SEED_TODAY=2026-11-01`), 5 failed and 5 controls passed. The same five failed on main 475420d9d in the gate triage.

**Affected specs:**
- Dev: none changed. `calendar.view` rule 5a is what the app does; the specs now follow it.
- Business: none.

### Change Plan
1. `e2e/helpers/app-week.ts`:
   - week arithmetic from `WEEK_STARTS_ON` (`appWeekStart`, `appWeeksAhead`, `dayInAppWeek`);
   - `seedAcademyMonday`, which mirrors `seed_dates._next_weekday(today, 0)`;
   - `e2eToday`, which reads `E2E_SEED_TODAY`, the seed's own pin;
   - `pinBrowserToE2eToday`.
2. The five specs navigate as many weeks as their target is away, and compute their expected dates from the same helper.
3. Verified single-file, pinned to a Sunday and to a Wednesday, and unpinned.
