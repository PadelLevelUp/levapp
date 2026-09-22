---
id: B-141
title: "Working hours: the time controls could pick minutes off the 15-minute grid, and the save was refused"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - settings.coach-working-hours
  - frontend/apps/mobile/src/components/ui/time-picker-input.tsx
  - frontend/apps/mobile/src/features/settings/working-hours-section.tsx
  - frontend/apps/web/src/components/settings/WorkingHoursSection.tsx
  - frontend/packages/config/src/availability.ts
proposed_fix: "The shared picker takes a minuteInterval prop, unset by default, and working hours sets 15; web snaps a typed time to the nearest quarter on blur through a shared snapToGrid()."
opened: 2026-09-21T18:34:00Z
resolved: 2026-09-21T18:47:00Z
---

# B-141 — the editor's time controls left the grid rule 2 demands

**Source:** Session D, 2026-09-21. Seen in a screenshot of the iOS wheel (…58, 59, 00, 01…) taken
while re-triggering flow 85 for PAD-361; ticketed on the coordinator's decision as PAD-369, with
the question widened to every control that feeds working hours, on web and iOS. Number from
Session D's reserved range. Same family as [B-140](B-140-add-window-creates-a-zero-length-window.md).

**What happened:** rule 2 refuses any window off a 15-minute grid, and both shells' controls
could leave it, so an ordinary edit was refused on save.

**Evidence (times UTC, code = feature/pad-361 @ c6f0ce1bd; both controls unchanged from staging 00e53375f):**
- iOS, 18:32–18:34: one nudge of the minute wheel set Monday's end to **22:01** (screenshot); the
  backend log shows the `PUT` answered 400; the editor showed the error on Monday.
- Web, 18:31–18:32: a typed end of **22:07**, `input.validity.stepMismatch === false`, `PUT` carried
  `tue: [["08:00","22:07"]]` → 400. The inputs' `step={900}` only drives the stepper arrows, and
  because React keeps the `value` attribute in sync the step base moves with the value, so the
  browser never flags it. `step` looked like protection and was none — this observation, not the
  attribute's presence, is what put web in scope.
- Controls that cannot leave the grid: "add window" (rule 5, B-140), the day switch, remove.
  Start ≥ end and overlaps remain a server-refused error by design (rule 2's criterion; flow 85).

**Root cause:** rule 3 describes the editor but never said its controls stay on rule 2's grid.
`TimePickerInput` passed no `minuteInterval`; it is shared by seven screens, six with no grid rule.

**Affected specs:**
- Dev: `.specflow/specs/settings/coach-working-hours.spec.md`
- Business: `.specflow/specs-business/settings/coach-configures-preferences-and-access.business.md` (no drift)

### Change Plan

**Spec to modify:** `.specflow/specs/settings/coach-working-hours.spec.md` — add rule 6 + criterion
"The time controls stay on the grid". Then unit tests, the web E2E test (fails first), iOS flow 92, the fix.

### Resolution

- Spec changes: rule 6 and its criterion.
- Tests added: `availability.test.ts` (5 `snapToGrid` tests); web `coach-working-hours.spec.ts`
  PAD-369 test (failed on the old code: sent 22:07 → 400; passes on the fix); Maestro flow 92
  (ios-only), 3/3, asserting the stored end is on the grid and is not 22:00.
- Code changes: `minuteInterval` prop on `TimePickerInput` (unset keeps each platform's own steps,
  so the other six callers do not change; reaches Android through `DateTimePickerAndroid`), set to
  `WORKING_HOURS_GRID_MINUTES` in the working-hours editor; web inputs snap on blur with `snapToGrid`.
- Not covered: Android was not run (the clock dialog is not drivable by the flow; the prop's
  Android path is the library's `MinuteIntervalSnappableTimePickerDialog`, unobserved here).
- Resolved: 2026-09-21 (PAD-369).
