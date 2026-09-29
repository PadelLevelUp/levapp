---
id: B-201
title: "iOS Mês grid: Sunday reported wrapping onto the next row, shifting every later date a weekday (not reproduced on simulator)"
type: test-defect
severity: high
status: triaged
affects:
  - calendar.mobile-views
  - frontend/apps/mobile/src/features/calendar/MonthGrid.tsx
proposed_fix: "Lay the grid out as one row per week of seven flex-1 cells instead of one flex-wrap row of 14.2857% cells, so no cell can wrap. Pinned by MonthGrid.test.tsx and Maestro flow 117."
opened: 2026-09-24T22:03:51Z
---

# B-201: iOS month grid, Sunday wrapping (PAD-437)

**Source:** owner feedback, PAD-437 (urgent), a student account on an iPhone. In October 2026, row 1 showed Mon 28 Sep to Sat 3 Oct correctly, but Sun 4 Oct appeared on the next row under SEG, and every later date was one weekday off (Thu 29 Oct under TER). The day panel named the right weekday.

**What should happen:** seven columns, Sunday under DOM (`calendar.mobile-views` rule 16).

**Mechanism (from the code):** the React Native `MonthGrid` put every cell in ONE `flex-row flex-wrap` row at width `${100 / 7}%`. The weekday header uses `flex-1`, so it always shows 7 labels. If Yoga's rounding makes 7 percentage cells slightly wider than the row, the 7th (Sunday) wraps. That is exactly the reported pattern, and it is the only way a cell in this grid can change row.

**Phase 1: NOT REPRODUCED.** The classification is provisional:
- iPhone 17 Pro simulator (402 pt): flow 117 green; the screenshot shows 7 columns, Sun 4 Oct under SUN.
- iPhone 13 mini simulator (375 pt, created for this): the same assertions are green; the screenshot shows 7 columns.
- A `yoga-layout@3` (JS) model of the row predicted a wrap at 375 pt that the simulator did not show, so that model is not faithful to RN's native Yoga and is not evidence.
- Code identical on `main` and `staging` since 2026-09-11, so the owner's build carries it.
- Asked the coordinator for the owner's model, Display Zoom, text size and build.

**Type (provisional):** `test-defect`. Rule 16 is right, but nothing pinned that the grid can't wrap: no test covered the layout structure, and no on-device flow checked Sunday's column.

### Change Plan
- `MonthGrid.tsx`: `monthWeeks()` splits `monthDays` into weeks. Each week is a `flex-row` (`testID="calendar-month-week"`) of seven `flex-1` cells. No `flex-wrap`, no percentage width.
- `MonthGrid.test.tsx`: 5 week rows × 7 cells for October 2026, row 1 ending on Sun 4 Oct, and no `flex-wrap` or percentage width anywhere. It is red on the old structure (0 week rows; two `flex-row flex-wrap` nodes) and green on the fix.
- Maestro flow 117: Sun 4 Oct and Sun 11 Oct each `rightOf` their Saturday (student, October 2026). Its `onFlowComplete` returns the calendar to week view (R-040).
- Spec: `calendar.mobile-views` rule 16 notes the seven-column structure.

### Resolution
Pending: the fix ships in PAD-437's PR. This entry stays `triaged` until the owner confirms 7 columns on the device that showed 6.
