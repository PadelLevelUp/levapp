---
id: B-541
title: "Student calendar: an open-spot class is an empty dashed card on the iOS day panel (white ink on white) and a solid block in the week grid; the phone web shell and the dots have no open-spot treatment at all"
type: incomplete-rule
severity: high
status: resolved
resolved: 2026-10-10T02:40:00Z
affects:
  - .specflow/specs/calendar/mobile-views.spec.md
  - .specflow/specs/eligibility/open-spot-visibility.spec.md
  - .specflow/specs/calendar/view.spec.md
  - frontend/packages/config/src/calendar-card.ts
  - frontend/apps/mobile/src/features/calendar/EventCard.tsx
  - frontend/apps/mobile/src/features/calendar/TimeGrid.tsx
  - frontend/apps/mobile/src/features/calendar/day-dots.ts
  - frontend/apps/web/src/components/calendar/mobile/MobileEventCard.tsx
  - frontend/apps/web/src/components/calendar/mobile/TimeGrid.tsx
  - frontend/apps/web/src/components/calendar/mobile/DayStrip.tsx
proposed_fix: "Give the shared card model an `open-spot` variant (card surface, 1.5 dashed outline in the class colour, readable ink) so the day card, the grid block and the day dots on both shells resolve it from one place; the shells drop their ad-hoc branches."
opened: 2026-10-10T02:05:00Z
---

# B-541: an open-spot class is an empty dashed card on the iOS day panel and a solid block in the grid

> Ledger id **unconfirmed** (wave-14 Session C range B-541–560; index line sits after B-463, the
> nearest lower id on this branch).

**Source:** PAD-579 (owner, App Store build, student "TP", Semana 19–25 Oct, screenshot of
2026-10-09 19:51). Items 1 and 2 of the ticket. Item 3 (a legend) is PAD-578's; item 4 (should a
student see 12/16 and the amber bar on a class they are not in) is an owner question — default
here: unchanged, the fill shows as today; the device matrix and the end-to-end review are PAD-580.

**What happens:** on the iOS day panel the open-spot card ("PEAK PERFORMANCE", 09:00–10:30,
12/16) shows no title, no time, no club and no chip — only the amber fill bar. In the week grid
the same class is a solid dark-blue block, exactly like an enrolled class. On the phone web shell
the open-spot card, the grid block and the strip/month dots are all solid: nothing says "offer".
The desktop web card is correct (dashed outline, readable ink, chip).

**What should happen:** `eligibility.open-spot-visibility` rule 11 — on both shells the open-spot
class keeps its colour as a dashed outline on the plain card surface with an "Open spot" chip, so
it reads as an offer; the title, time and club are legible; the grid block and the day dots agree
with the card.

**Evidence (Phase 1):**
- Reproduced in `apps/mobile/src/features/calendar/open-spot-render.test.tsx` on staging
  c0d345720 (react-test-renderer): the card's title `Text` has `color: "#FFFFFF"` where
  `readableInkNative("#1355DC")` is `#123c90`; the grid block's style is
  `backgroundColor: "#1355DC"` with no dashed border.
- Where the wrong value first appears: `EventCard.tsx:44–46` — `surface` is
  `cardSurfaceNative(hex, "scheduled")` (white ink on the solid colour) and the open-spot branch
  at line 50–53 swaps the *surface* to the white card but keeps `ink = surface.color`. Present
  since PAD-130 (72e5fe003) — the branch was added on top of the solid variant instead of as a
  variant.
- `TimeGrid.tsx:105–108`, `MobileEventCard.tsx:31–34`, web `mobile/TimeGrid.tsx:117–120`,
  `day-dots.ts` and web `DayStrip.dotColor` paint only what `resolveCardVariant` +
  `cardSurface*` return, and that model has no open-spot variant (`CardVariant` =
  scheduled | next | past | canceled | block).

**Root cause (tree):** dev specs exist (`calendar.mobile-views`, `eligibility.open-spot-visibility`).
`mobile-views` rule 5 — the one treatment table both shells and every surface (rules 10 and 13
say "per rule 5") resolve from — has no open-spot row, so the grid and the dots had no
instruction and the card patched the treatment locally and inherited the wrong ink.
`open-spot-visibility` rule 11 names the card but neither the ink nor the grid block/dot, and
its only criterion ("An eligible student sees an open spot in a visible class") asserts
"visually distinct", not the treatment. First NO at the rule node → **Type 2, incomplete rule**;
criteria added on both specs. `calendar.view` still carries a "not built — ahead of PAD-130"
banner for rules 4 and 6 that PAD-130 built: stale, corrected in the same edit.

**Drift check:** the business spec (`student-discovers-open-spots`, "visually distinct from their
own enrolled classes, clearly marked as a spot they could take") still matches rule 11. No drift.

**Affected specs:**
- Dev: `calendar/mobile-views.spec.md` (rules 5, 10, 13), `eligibility/open-spot-visibility.spec.md`
  (rule 11 + criterion), `calendar/view.spec.md` (stale banner).
- Business: `eligibility/student-discovers-open-spots.business.md` — unchanged.

### Change Plan

**Spec to modify:** `.specflow/specs/calendar/mobile-views.spec.md` — add the row to rule 5:
`open-spot` (the event carries `openSpot`, whatever its state short of canceled): card surface,
1.5px **dashed** outline in the coach colour, title and time in the coach colour via
`readableInk`, the "Open spot" chip; it wins over `scheduled`/`next` (an offer is never the
student's next class). Rule 10: a dot takes the **outline** colour when the surface is outlined
(`next`, `open-spot`) — a `next` class paints a white dot today for the same reason. Rule 13: the
grid block of an open spot is the dashed outline too.
**Spec to modify:** `eligibility/open-spot-visibility.spec.md` rule 11 — name the ink
(`readableInk` of the class colour), the grid block and the dot; add the criterion:

#### An open-spot card is legible and the grid agrees with it (rule 11, B-541)
- **Given** a student eligible for a visible class coloured `#1355DC`, 12 of 16 filled
- **When** their calendar renders it on the phone (web or iOS), in the day panel and the week grid
- **Then** the card and the grid block are the card surface with a 1.5px dashed `#1355DC`
  outline, title and time in `readableInk(#1355DC)`, the "Open spot" chip on the card
- **And** the day's dot is `#1355DC`

**Then:**
1. `@levelup/config` `calendar-card.ts`: `CardVariant` gains `"open-spot"`; `resolveCardVariant`
   returns it for `event.openSpot` (canceled still wins); `cardSurfaceWeb`/`cardSurfaceNative`
   return card surface + dashed outline + readable ink (native: `borderStyle: "dashed"`);
   `seatsShort` keeps today's amber for an open spot (item-4 default). Red-first cases in
   `calendar-card.test.ts`.
2. Shells drop their ad-hoc branches: `EventCard.tsx` (keep the chip), `CalendarEventCard.tsx`;
   `TimeGrid` (both shells) applies `borderStyle`; `day-dots.ts` / `DayStrip.dotColor` take
   `borderColor ?? backgroundColor`.
3. Tests: mobile `open-spot-render.test.tsx` (red now), `day-dots.test.ts`; web
   `MobileEventCard` + phone `TimeGrid` jsdom tests watched red first; packages cases.
4. No Maestro flow: a device flow cannot assert a colour; the render tests are the proof.
5. Regression: calendar unit files on both shells, packages config.

### Resolution

- Spec changes: `calendar/mobile-views.spec.md` (rule 5 `open-spot` row, rule 10 outline colour
  for dots, rule 13, criterion "An open spot is the dashed outline on every surface");
  `eligibility/open-spot-visibility.spec.md` (rule 11 amended, criterion "An open-spot card is
  legible and the grid agrees with it"); `calendar/view.spec.md` (stale "not built" banner).
- Tests added/modified: `packages/config/src/calendar-card.test.ts` (variant, web and native
  surfaces — watched red); mobile `open-spot-render.test.tsx` (card ink + grid block — the
  reproduction, red first), `day-dots.test.ts` (red once the variant existed, green after the
  dot fix); web `mobile/MobileEventCard.openSpot.test.tsx` (card, grid block, dot — red against
  the old shared module via a checkout of `calendar-card.ts`, green restored).
- Code changes: `@levelup/config` `calendar-card.ts` gains the `open-spot` variant
  (`resolveCardVariant`, `cardSurfaceWeb`, `cardSurfaceNative` with `borderStyle`); iOS
  `EventCard` drops its local branch (chip keyed on the variant), `TimeGrid` applies
  `borderStyle`, `day-dots` takes the outline colour; web `MobileEventCard` gains the chip,
  `DayStrip.dotColor` takes the outline colour. The desktop `CalendarEventCard` was already
  correct and is untouched. Item-4 default kept: the fill bar and count show on an open spot.
- Resolved: 2026-10-10 (PAD-579; ledger id unconfirmed)
