---
id: B-682
title: "The coach's needs-you queue stretched a reply card to a class card's height and offered next week's classes"
type: incomplete-rule
severity: low
status: resolved
affects:
  - dashboard.blocks
  - backend/padel_app/helpers/dashboard/coach_home.py
  - frontend/apps/web/src/components/dashboard/coach/NeedsYouQueue.tsx
proposed_fix: "Add rules to dashboard.blocks rule 3: empty_seats overlap [now, next Sunday 00:00), and every card keeps its own height (items-start on the web grid)."
opened: 2026-10-23T18:32:19Z
resolved: 2026-10-23T18:32:19Z
---

# B-682: needs-you stretched a reply card and showed next week

**Source:** owner report on Thursday 22 Oct 2026, coach web desktop. Linear PAD-740.

**What happens:**
1. On desktop a "<name> respondeu" reply card sharing a row with an empty-seats class card
   grows to the class card's height, and its content floats in the middle of empty space.
2. On Thursday 22 Oct the queue offers a class on Thursday 29 Oct, which is next week.

**What should happen:**
1. A reply card is always as compact as its content.
2. The queue offers only this week's classes, Sunday to Saturday. From Sunday 25 Oct it
   moves to 25–31 Oct.

**Root cause:**
1. **The stretched card.** The web queue is `grid grid-cols-1 gap-2.5 lg:grid-cols-2` with no
   `align-items` (`NeedsYouQueue.tsx:62`). Grid's default `stretch` gives each card its row's
   height. No `h-full` is involved: `ActionCard` (`primitives.tsx:210`) has no height class.
2. **Next week's classes.** `_empty_seat_items` cut `[now, now + SCHEDULE_DAYS)`, a rolling
   7 days (`coach_home.py:347` before the fix).
3. **Why the rule was incomplete.** No rule in `dashboard.blocks` defined the `empty_seats`
   window. Rule 3 gave only the order. The 7 days were implied by acceptance criteria, and a
   rule existed only for `schedule_7d`. Card height had no rule at all.

**Evidence:**
- The new `test_pad740_needs_you_current_week.py` run on the pre-fix `coach_home.py` gives
  2 failed and 2 passed:
  - `test_on_a_thursday_next_thursday_is_absent` failed (it got Thursday 29 Oct);
  - `test_the_week_ends_at_saturday_midnight` failed (it got Sunday 00:30).
- With the fix, all 4 pass.

**iOS / Android:**
- The mobile queue (`frontend/apps/mobile/src/features/dashboard/blocks.tsx` `NeedsYouQueue`) is
  a single `View` column, so no sibling sets a card's height. The layout fix is web-only.
- The window is computed by the server, so it applies to every shell.

### Change plan (applied)

- **Spec:** `dashboard.blocks` rule 3 gains the current-week window for the coach's
  `empty_seats`, and the PAD-424 card note gains "every card keeps its own height".
  - The criteria on lines formerly 294 and 334 now say "this week".
  - Four new criteria: next Thursday absent on a Thursday, the Saturday-midnight edge, the
    Sunday roll-over, and the compact reply card.
  - The business spec gains the matching rule.
- **Backend:** `_empty_seat_items` ends its window at `week_start(now) + 7 days`. That is the
  same week the week pulse counts.
- **Web:** `items-start` on the queue grid.
- **E2E:** new `pad740-needs-you-card-height.spec.ts`.
  - On a Saturday the seed has no under-capacity class left in the week, so the three specs that
    need an empty-seats card skip with the rule cited (B-030 Later, PAD-285 Convidar and PAD-424
    Mais tarde). Before, PAD-424 asserted the card visible.
  - A Saturday-only seed fixture was weighed and rejected: a class today becomes the coach's
    hero, enters today's calendar on every weekday, and takes the spare schedule row the
    PAD-343 invariant keeps.

**Found while fixing (not changed here):**
- `load_lesson_instances_for_coach` filters `start_datetime >= range_start`
  (`calendar_helpers.py:95`). So when a block loads its own window (`events=None`), a class
  already running at `now` never reaches it, while the dashboard's preloaded superset (rule 8)
  keeps it.
- The dashboard always passes the preloaded set (`helpers/dashboard/coach.py`), so users see no
  difference. Rule 8's "identical to loading each window separately" does not hold for a running
  class, though.
