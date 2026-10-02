---
id: B-194
title: "E2E mobile-month-view US-286-1 measured the month grid while the Mês tree was being replaced, and got a null box"
type: test-defect
severity: low
status: resolved
affects:
  - frontend/apps/web/e2e/schedule-calendar/mobile-month-view.spec.ts
proposed_fix: "openMonth waits for the day sheet; the resting geometry is polled until both boxes are real."
opened: 2026-09-29T18:06:51Z
resolved: 2026-09-29T18:06:51Z
---

# B-194: US-286-1 measured the month grid mid-replacement

**Source:** the wave-9 gate (2026-09-29), shard 3/4 at `1b6f4f0ff`. B-id reassigned by the coordinator from
Session-C's range.

**What happens:** `TypeError: Cannot read properties of null (reading 'y')` at spec:315:42. That's `gridBox.y`:
`monthGrid.boundingBox()` returned null right after `openMonth()` had asserted the grid visible.
- Alone on `1b6f4f0ff`: 2/2 failed.
- Alone on main `f06933f99`: 2 of 3 failed.

It's not a wave-9 regression.

**Root cause (observed):** a frame-by-frame probe (`requestAnimationFrame`, each element tagged) found two things.
- The `calendar-month-grid` element is **replaced** about 16 ms after it first paints, in 6 of 6 runs: element 1 at
  about 60 ms, element 2 at about 75 ms, same geometry.
- The day sheet mounts at about 70–100 ms and is never replaced.

`openMonth`'s visibility check can pass on the first element, and the test's next `boundingBox()` can land on it
as it's detached, which returns null. A delayed-sheet mutant did not redden the old spec, because `boundingBox()`
waits for attachment. That ruled out "the sheet hasn't mounted yet" as the cause. Nobody sees the replacement,
since the geometry is identical, so this is not user-facing. The component above MonthGrid that swaps the tree
wasn't traced.

**Affected specs:** Dev `calendar` Mês rule 17 (PAD-436) is correct, and the test encodes it. Business: no drift.

### Change Plan (Type 7: correct spec, wrong test)

1. `openMonth` also waits for `calendar-day-sheet` to be visible. That covers US-248-6's handle drag too.
2. US-286-1's resting check polls both boxes until they're real and agree (≤1 px), and only then reads `gridBox`
   for the raised-height checks.

### Resolution

- Tests: `mobile-month-view.spec.ts` (`openMonth` and US-286-1). No app changes.
- **Red** (probabilistic, as a load race is): the old spec failed 2/2 alone at the frozen SHA and 2/3 on main,
  plus once in the cells (`b194-b235-cells.log`).
- **Green:** 5/5 alone, together with editor-i18n (9 passed each run).
- Resolved: 2026-09-29T18:06:51Z.
