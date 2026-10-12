---
id: B-544
title: "Calendar grids cut classes outside their hours: desktop fixed at 07–22 (a 22:30 class is a 20 px stub), phones clamped to 07–23, and a midnight end read as 00:00 dropped the class from the range"
type: wrong-rule
severity: medium
status: resolved
resolved: 2026-10-11T16:30:00Z
affects:
  - .specflow/specs/calendar/mobile-views.spec.md
  - .specflow/specs/calendar/view.spec.md
  - frontend/packages/config/src/calendar-grid.ts
  - frontend/apps/web/src/components/calendar/CalendarGrid.tsx
  - frontend/apps/web/src/pages/CalendarPage.tsx
proposed_fix: "The hour range never cuts a class: phones keep rule 13's padded 07–23 window but widen to the whole hours of any class outside it; desktop keeps 07–22 and widens likewise (desktopHourRange); a midnight end counts as 24:00 in the range and the block geometry."
opened: 2026-10-11T16:00:00Z
---

# B-544: the calendar grids cut classes outside their hours

> Ledger id **unconfirmed** (wave-14 Session C range; index line after B-543).

**Source:** PAD-580 calendar QA (staging 12fc5c8da), filed as PAD-626.

**What happens:** on the desktop week a class 22:30–00:00 is a 20 px stub at the bottom of the
column with only its title (QA observation: card box h=20 at the grid's end); any class before
07:00 is cut likewise. On phones the range is clamped to 07:00–23:00, and a class ending at
midnight was read as ending at 00:00, so it did not widen the range at all.

**What should happen:** every class is shown whole, at its real height, on every grid.

**Evidence (Phase 1):**
- Red tests in `calendar-grid.test.ts`: `resolveHourRange([06:00–23:00])` → `{7,23}` (the 06:00
  hour cut); `resolveHourRange([09:00–10:00, 22:30–00:00])` → `{8,11}` (the midnight class ignored:
  its end read as minute 0); `eventBlockGeometry(22:30–00:00)` → height 18 (floor) instead of 90;
  desktop has no range function at all.
- Code: `CalendarGrid` defaults `startHour = 7, endHour = 22` and `CalendarPage` passes neither;
  `getEventStyle` computes `end - start` from the raw "00:00".
- The existing test "clamps to 07:00–23:00" asserted the cutting (06:00 → 07): the rule it encodes
  is what is wrong.

**Root cause (tree):** `calendar.mobile-views` rule 13 exists and says "clamped to 07:00–23:00" —
a clamp that cuts a real class is a **wrong rule** (Type 3); the desktop grid has no range rule at
all (same fix, new rule 21 in `calendar.view`). Decided here (no owner question needed: no reading
of the product wants a class cut off): the window is a default, never a cut.

**Drift check:** business `coach-views-and-manages-schedule` — the coach sees their schedule; no
drift.

### Change Plan

**Change `calendar.mobile-views` rule 13** "rounded to whole hours and clamped to 07:00–23:00" →
"rounded to whole hours and clamped to 07:00–23:00 — except that a class outside that window widens
it to the class's whole hours (a midnight end counts as 24:00): the grid never cuts a class".
**Add `calendar.view` rule 21**: the desktop week shows 07:00–22:00, widened likewise
(`desktopHourRange`). Criteria on both.

**Then:** implement `endMinutes` in `resolveHourRange` and `eventBlockGeometry`; `desktopHourRange`;
`CalendarPage` passes the range; `CalendarGrid.getEventStyle` uses the shared geometry. Update the
old clamp test (it encoded the wrong rule).

### Resolution

- Spec changes: `calendar/mobile-views.spec.md` rule 13 (the window never cuts a class; midnight
  = 24:00) + criterion "The grid never cuts a class"; `calendar/view.spec.md` rule 21 + criterion
  "A late class is whole on the desktop week".
- Tests: packages — `resolveHourRange` widening and midnight, `eventBlockGeometry` midnight,
  `desktopHourRange` (4 red against the shipped code/stub, green); the old "clamps to
  07:00–23:00" test narrowed to "while every class fits" (it encoded the wrong rule). Web
  `CalendarGrid.dense.test.tsx` "desktop grid hours" — the late-class case red against a fixed
  22:00 mutant, green restored.
- Code: `endOf` (midnight = 24:00) in `resolveHourRange` and `eventBlockGeometry`;
  `desktopHourRange`; `CalendarGrid` computes its range from its events (a caller may still pin
  it), uses the shared geometry, and a drag to the 24:00 bottom yields "00:00".
- Resolved: 2026-10-11 (PAD-626; ledger id unconfirmed)
