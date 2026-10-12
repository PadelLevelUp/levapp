---
id: B-543
title: "A dense day was unreadable: a chain of overlapping classes got one column per class (22 classes → 22 slivers of ~20 px, no titles) though at most two ran at once"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-11T15:20:00Z
affects:
  - .specflow/specs/calendar/mobile-views.spec.md
  - .specflow/specs/calendar/view.spec.md
  - frontend/packages/config/src/calendar-grid.ts
  - frontend/apps/web/src/components/calendar/CalendarGrid.tsx
  - frontend/apps/web/src/components/calendar/mobile/TimeGrid.tsx
  - frontend/apps/mobile/src/features/calendar/TimeGrid.tsx
proposed_fix: "Lane packing in the shared layout (columns = classes running at once, a freed lane is reused) used by all three grids; beyond a cap (3 desktop, 2 phone) the extra classes of a cluster collapse into one '+N' marker — desktop opens a list of them, phone selects the day whose sheet lists every class."
opened: 2026-10-11T14:40:00Z
---

# B-543: a dense day gave every class its own column

> Ledger id **unconfirmed** (wave-14 Session C range; index line after B-542).

**Source:** PAD-580 calendar QA (staging 12fc5c8da), filed as PAD-625 (High).

**What happens:** a coach with 22 classes on one day, 60 min each, one every 40 min, sees the
desktop day column as a staircase of ~20 px coloured slivers with no title, time, level or fill
(screenshot `docs/qa/reports/2026-10-11-pad-580-calendar-qa/web/coach-desktop-chrome/coach-desktop-semana-26.png`).

**What should happen:** the coach can read every class on a dense day — at least title and time
on the grid, and every class reachable in one tap.

**Evidence (Phase 1):**
- Red unit test (`calendar-grid.test.ts`, "packs a chain of overlaps into as many columns as run
  at once"): `layoutDayEvents` on the 22-class chain returns `columns = 22` for every block; the
  maximum number of classes running at any instant is 2.
- Where the wrong value first appears: `groupOverlappingEvents` builds TRANSITIVE clusters (a
  overlaps b, b overlaps c → one group), and every consumer gives each member its own column —
  `layoutDayEvents` (`columns: group.length`, phone grids on web and iOS) and the desktop
  `CalendarGrid` (`columnWidth = 100 / group.length`). A second red case: a 2-hour class with two
  back-to-back half-hour classes inside it got 3 columns, not 2 (a freed column is never reused).
- History: the grouping was lifted from the desktop grid into `calendar-grid.ts` by PAD-247 and
  has had this shape since; nothing this week changed it.

**Root cause (tree):** dev spec exists (`calendar.mobile-views` rule 13; `calendar.view` covers the
desktop grid). Rule 13 says only that overlapping events "share the width side by side"; neither
spec says how many columns a cluster gets or what happens beyond a readable number. First NO at
the rule node → **Type 2, incomplete rule**.

**Drift check:** business `calendar/coach-views-and-manages-schedule.business.md` promises the coach
sees their schedule; it says nothing about density. A business rule is added ("a busy day stays
readable"). No drift beyond that gap.

### Change Plan

**Specs:** `calendar.mobile-views` rule 13 gains the packing + cap + "+N" sentences; `calendar.view`
gains rule 19 (desktop grid: same shared layout, cap 3, "+N" opens a list); criteria on both;
business rule added.

**Then:**
1. `@levelup/config` `calendar-grid.ts`: `layoutDayEvents` packs lanes (first free lane, sorted
   by start; `columns` = lanes the cluster uses); `layoutDayColumn(events, {…, maxColumns})`
   returns `{ blocks, overflow }` — when a cluster needs more than `maxColumns` lanes, lanes
   `0..maxColumns-2` render and one marker per cluster takes the last column with its hidden
   events, spanning their time. Red-first tests (done for packing).
2. Desktop `CalendarGrid`: uses `layoutDayColumn` with `maxColumns: 3`; the "+N" marker is a
   button opening a popover list of its classes (each opens the class as a card click does).
3. Phone grids (web `mobile/TimeGrid`, iOS `TimeGrid`): `maxColumns: 2`; the marker selects the
   day (the sheet lists every class).
4. Tests: packages (packing, cap), web desktop + phone, iOS render.

### Resolution

- Spec changes: `calendar/mobile-views.spec.md` rule 13 (+ criterion "A dense day keeps its classes
  readable"); `calendar/view.spec.md` rule 20 (+ criterion "A dense day on desktop keeps every
  class readable"); business `coach-views-and-manages-schedule` rule "A busy day stays readable".
- Tests: packages `calendar-grid.test.ts` (packing ×2 watched red on the shipped code; cap and
  midnight watched red against mutants); web `CalendarGrid.dense.test.tsx` (chain → 2 columns,
  "+2" list opens a class) and the phone-grid case in `MobileEventCard.openSpot.test.tsx`; iOS
  case in `enrolled-mark-render.test.tsx` — all four red against the one-column-per-event or
  cap-ignored mutant, green restored.
- Code: `layoutDayColumn` (lane packing, cap, overflow markers, midnight end) in `@levelup/config`;
  `layoutDayEvents` now returns its packed blocks; desktop `CalendarGrid` uses it with cap 3 and a
  "+N" popover list; web and iOS phone grids with cap 2, marker selects the day.
- Resolved: 2026-10-11 (PAD-625; ledger id unconfirmed)
