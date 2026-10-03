---
id: B-271
title: "Web class sheet: the student picker showed four students and the rest could not be reached"
type: missing-criterion
severity: high
status: resolved
affects:
  - classes.create
  - frontend/apps/web/src/components/calendar/PlayerSelector.tsx
proposed_fix: "Replace the Radix ScrollArea (max height only) with a native overflow-y-auto list in both tabs of the picker. Rule 10 says every student can be reached; an E2E test scrolls by wheel."
opened: 2026-10-02T18:02:16Z
resolved: 2026-10-02T19:03:36Z
---

# B-271: the class picker showed four students

**Source:** PAD-502 (a coach, through the issue bot): "filtering by level 5- shows only 4 players when about 20 match; no way to load more".

**What happens:** on web, in the add-class and class-edit sheets, the picker's list showed four rows. The other rows were in the page but clipped, and neither wheel nor trackpad moved the list. It was not the level filter and not a count: "Todos" with a full roster showed four as well. Searching by name hid the problem, because a search narrows the list to a few rows.

**What should happen:** every student in the list can be reached by scrolling inside it (rule 10).

**Root cause:** Type 1, a missing criterion. Rule 10 describes the picker's content; no criterion covered a list longer than its window. The list was `<ScrollArea className="max-h-52">`: Radix's root got a maximum height (208 px) and `overflow: hidden`, while its viewport is `h-full` of a root with no height, so the viewport grew to the whole list and never overflowed itself. 208 px over 52 px rows is exactly four. There is no slice or limit in the picker, and the server returns the whole roster (`/coach_players`, no limit). Same family as B-202 (PAD-439): a Radix ScrollArea that does not scroll where a person scrolls.

**Evidence (Phase 1, 2026-10-02, isolated stack, staging de0a25482):**
- E2E with twenty students of one level added to the roster's answer, level chip tapped, mouse wheel over the list: on the old code the last student ends at 2860 px while the list ends at 629 px (FAILED); after the fix it is inside the list and can be ticked (PASSED).
- Read, not run: the mobile app's picker is a native ScrollView (`max-h-64`, `nestedScrollEnabled`); it has no ScrollArea. Its reach beyond the first rows is not pinned by a flow: flow 126 scrolls the screen to a row, not the list. To be checked on the simulator.

**Why the existing tests missed it:** the web specs that use the picker reach a student by typing the name, which leaves one row.

### Resolution
- Spec: `classes.create` rule 10 says every student can be reached, with a criterion.
- Test: `e2e/calendar/pad502-player-selector-long-list.spec.ts` (wheel).
- Code: `PlayerSelector.tsx`, both tabs' lists are native `max-h-52 overflow-y-auto overscroll-contain` divs; test ids on the tab, the level chips, the lists and the rows; `calendar-toolbar-add-class` on the desktop button.
