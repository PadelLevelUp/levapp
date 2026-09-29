---
id: B-193
title: "E2E add-to-classes-week (PAD-439) assumed three seeded classes next week, true on six weekdays of seven"
type: test-defect
severity: low
status: resolved
affects:
  - frontend/apps/web/e2e/players/add-to-classes-week.spec.ts
proposed_fix: "Wait for the two classes the seed puts in next week on every weekday, in a 1280×460 window, and assert the list overflows."
opened: 2026-09-29T14:23:00Z
resolved: 2026-09-29T14:23:00Z
---

# B-193: add-to-classes-week assumed three classes next week (PAD-466)

**Source:** PAD-466. The scheduled `levapp-test-health` run on Mon 2026-09-28 failed `add-to-classes-week.spec.ts:54` with `rows.nth(2)` not found. It reproduced alone.

**Reproduced (Session-C, 2026-09-29):** on an isolated stack, the spec fails with `E2E_SEED_TODAY=2026-09-28` (Monday) and passes unpinned (Tuesday). A probe of the picker's next week showed:
- on the Monday seed, 2 rows: the academy class (Mon) and the recurring class (Tue);
- on the Tuesday seed, 3 rows, the extra one being "E2E Upcoming Class".

**Root cause (Type 7, the test):**
- The spec waited for a third row: "the Monday academy class, the recurring ones, the full upcoming class".
- `seed_dates.py` puts the upcoming class on `min(next Monday, today + 6)`. That is deliberate (PAD-343): on a Monday it is this week's Sunday.
- So the assumption held on six weekdays of seven.
- Separately, the spec never asserted that the list overflowed, so a list that fitted would have passed its footer check without scrolling anything.

**Not the cause:** the picker. It lists exactly what the API returns for the week. The investigation did find a real picker defect, the missing Sunday, filed as B-192.

### Change plan (executed)
- Wait for `rows.nth(1)`: the academy and recurring classes are in next week on every weekday, per `seed_dates.py`.
- A 1280×460 window. Measured on the Monday seed: 2 rows overflow the list by 69 px at 460, and by only 18 px at the old 520.
- Assert `scrollHeight - clientHeight > 0` on `add-to-classes-list` before the wheel.
- The spec criterion "A long week scrolls inside the picker" is updated to 1280×460, with the overflow asserted.
- No seed change and no DB writes.

### Resolution
Isolated stack, app fix applied:
- old spec, Monday seed: **1 failed** (`nth(2)`);
- new spec, Monday seed: passed;
- new spec, unpinned (Tuesday): passed.

Resolved: 2026-09-29T14:23:00Z
