---
id: B-128
title: "A week-view E2E test expected the next class filled, and failed only from Monday 09:30 to Tuesday 11:30"
type: test-defect
severity: medium
status: resolved
affects:
  - frontend/apps/web/e2e/schedule-calendar/mobile-week-view.spec.ts
proposed_fix: "Pin the browser clock inside US-247-2 so past, next and scheduled all appear at once, and assert each as calendar.mobile-views rule 5 states it."
opened: 2026-09-21T20:47:57Z
resolved: 2026-09-21T21:33:40Z
---

# B-128 — a week-view test expected the "next" class filled

**Source:** the wave-1 integrator's Playwright run, Monday 2026-09-21: `mobile-week-view.spec.ts:167`
(PAD-247, US-247-2) failed at line 200 — expected `background-color rgb(13, 148, 136)`, received
`rgb(255, 255, 255)` on the block of `class-2001`. The integrator proved it pre-existing: it fails
alone on the batch (20:44–20:45 UTC) and alone on `origin/staging` `00e53375f` (20:45–20:46 UTC)
with the identical value, and wave 1 touches no calendar file. Ticket PAD-391. Ledger number from
Session-B's reserved range (B-125–134), assigned by the Coordinator.

**Which side was wrong.** Read, not run (Session-B, 2026-09-21, `origin/staging` `00e53375f`):

- `calendar.mobile-views` rule 5 is unambiguous — `next`: "white card with a 1.5px outline in the
  coach colour"; criterion "Next class is outlined, not filled". `scheduled` is the solid coach
  colour, `past` the faded one.
- The component does exactly that: `cardSurfaceWeb` in `packages/config/src/calendar-card.ts`
  returns the card background with `1.5px solid <hex>` for `next`, and `TimeGrid.tsx` applies it.
  **A coach sees the right thing; there is no product bug.**
- The test branched on the block's state: `past` → not the raw hue; **`scheduled` *or* `next` →
  the raw hue.** The second half contradicts the spec for `next`.

**Why it looked like a flake.** The mocked week is "this week" by the real clock, and
`findNextEventId` picks the soonest class that has not finished. The Tuesday class (10:00–11:30) is
`next` from the moment "Monday Early" (09:00–09:30) is over until it ends: **Monday 09:30 →
Tuesday 11:30 club time, about 26 hours in every week.** Outside that window the wrong branch is
never reached, so the spec was green six days in seven and red for a reason no diff explained.
Same family as B-100 (a pinned "now" against a real-clock fixture): here nothing was pinned at all,
and the test tried to cope with the clock by branching — which hid the branch that was wrong.

**Fix (test only, PAD-391).** Inside US-247-2 the browser clock is pinned to Wednesday 08:00 of the
mocked week (`page.clock.setFixedTime`, as `mobile-day-view.spec.ts` does since PAD-253), so the
week holds all three treatments at once and each is asserted as the spec states it: Tuesday
`class-2001` = `past` (not the raw hue); Thursday A `class-2002` = `next` (not filled, outline in
`#6366F1` — the criterion's own example colour); Thursday B `class-2003` = `scheduled` (solid
`#1355DC`). The pin is scoped to that test: US-247-6 compares with the real today. No branch on the
day of the run is left.

**Run (Session-B, 2026-09-21, a Monday evening — inside the window; isolated stack, workers=1,
`feature/pad-391` at `c371384b1`, each log opens with its SHA and a `date -u` stamp):**

| | what ran | result |
|---|---|---|
| new test, real component | the whole `mobile-week-view.spec.ts`, started 21:31:37Z | **7 passed** |
| old test, real component | `origin/staging`'s US-247-2 on the same stack, started 21:32:43Z | **1 failed** — expected `rgb(13, 148, 136)`, received `rgb(255, 255, 255)`: the integrator's value, reproduced |
| new test, MUTANT component (`next` drawn filled — what the old test demanded) | US-247-2, started 21:33:40Z | **1 failed**, at the `next` assertion on `class-2002` (`data-event-state="next"`): expected not `rgb(99, 102, 241)`, received it |

**Strengthened after Session-C's review of #362** (the assertions above said only what `past`
and `next` are NOT): the four treatments — past, next, scheduled, block — must be four different
computed backgrounds, and `past` not transparent; no literal faded value, which would only restate
`fadeColor`. Whole file, started 21:43:35Z → **7 passed**; against a MUTANT that draws `past` with
the muted block treatment, started 21:44:32Z → **1 failed** (`Expected: 4, Received: 3`).

So the new test passes on the day the old one fails, fails when the component is made wrong, and
the pinned instant produces the states read from the code. Not run: the old test on a day when
Tuesday is not `next` (it passes then — that is how it survived); the new test on another real
day (independent by construction: the pin and the mocked week derive from the same Monday).
