---
id: B-710
title: "On the phone, the week grid could not scroll its last hours above the day sheet, so late classes were hidden and could not be tapped"
type: missing-criterion
severity: high
status: triaged
affects:
  - calendar.mobile-views
  - frontend/apps/mobile/src/features/calendar/GridWithSheet.tsx
  - frontend/apps/mobile/src/features/calendar/TimeGrid.tsx
  - frontend/apps/web/src/components/calendar/mobile/GridWithSheet.tsx
  - frontend/apps/web/src/components/calendar/mobile/TimeGrid.tsx
proposed_fix: "calendar.mobile-views rule 13: the week grid's scroll content ends with bottom padding as tall as the part the day sheet covers (grid height minus the sheet's top), never shorter than the floating buttons' clearance, following the sheet's committed position; on iOS and web."
opened: 2026-10-29T21:15:00Z
---

# B-710: the week grid's last hours stayed under the day sheet

**Source:** the owner, Linear PAD-790 (2026-10-29 19:54Z), with an iPhone screenshot. In Calendário
→ Semana (25–31 Oct) the grid stopped around 19:00, and a Thursday 19:30 class showed only a sliver
behind the day sheet "quinta-feira, 29 outubro · 6 aulas" and the floating buttons. It could not
be read or tapped.

**What happens:** `GridWithSheet` lays the `TimeGrid` over the whole container, and the `DaySheet`
floats over it, absolutely positioned at `sheetTop`. At rest that is 60% of the container
(`sheetTopBounds`). The grid's `ScrollView` content is exactly `(endHour − startHour) × ROW_HEIGHT
+ 1` tall, with no bottom padding. Scrolled to the end, the content's bottom meets the container's
bottom, so the part of the day the sheet covers (about 40% at rest) can never come out from under
it. Web's phone layout has the same structure (`TimeGrid` `absolute inset-0` under the sheet).

The range is not cut. `resolveHourRange` widens the range to an hour past the latest class (B-544),
so the rows exist and are only unreachable. #847's `bottom-inset.ts` is the Android navigation-bar
inset; the grid never used it and it is not involved.

**Evidence:** code on staging 3404796a9 (`GridWithSheet.tsx`, `TimeGrid.tsx`,
`calendar-grid.ts` `sheetTopBounds`/`resolveHourRange`, on both shells) and the owner's screenshot.
The simulator reproduction is pending; the simulator was taken by the promotion gate.

**What should happen:** scrolled to the end, the last hour row ends above the sheet's top edge,
with the sheet at rest, raised or lowered, and never closer to the screen bottom than the floating
buttons' clearance. The sheet's own drag is unchanged.

**Root cause:** rule 13 already said the grid "scrolls vertically when taller than the space above
the sheet", but no criterion pinned that the end of the day clears the sheet. The implementation
let the grid run under the sheet. Type: missing-criterion.

### Change Plan

**Spec:** `calendar.mobile-views` rule 13, with a sentence on the bottom padding (PAD-790, B-710);
new criterion "The last hour clears the sheet". Business: `coach-views-and-manages-schedule` journey
step 1.

**Then:**
1. A shared helper `gridBottomInset(containerHeight, sheetTop, fabClearance)` in `@levelup/config`,
   with unit tests.
2. Red tests: iOS and web `GridWithSheet` render tests, where the grid's scroll content carries that
   padding at rest and after the sheet moves.
3. Fix both `GridWithSheet`/`TimeGrid` pairs.
4. Maestro flow 315: a seeded Thursday 21:30 class, scroll the grid to its end, the block sits above
   the sheet and opens class detail.

### Resolution

(pending)
