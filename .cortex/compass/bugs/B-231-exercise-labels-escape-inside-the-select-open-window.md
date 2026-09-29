---
id: B-231
title: "E2E PAD-53 exercise-labels-i18n pressed Escape inside the Select's first ~50 ms, which also closed the New Exercise sheet on a fast machine"
type: test-defect
severity: low
status: resolved
affects:
  - training.exercises
  - frontend/apps/web/e2e/exercise-management/exercise-labels-i18n.spec.ts
proposed_fix: "Close each form Select by choosing its current option (not an immediate Escape), then assert the sheet heading is still visible before Create."
opened: 2026-09-29T13:32:34Z
resolved: 2026-09-29T13:57:38Z
---

# B-231: exercise-labels-i18n loses the New Exercise sheet to an early Escape

**Source:** Session-E's wave-8 E2E gate (2026-09-29), shard 2/4, on the new Mac. Linear PAD-468.

**What happens:** `exercise-labels-i18n.spec.ts:60` times out after 180 s waiting for
`getByRole('button', { name: /create exercise/i })`. The failure screenshot shows the Exercises
list with the New Exercise sheet closed. It failed 4 of 4 on this machine: twice alone on staging
`8ead1d1b7`, and twice alone on main `ac5b4f844`. The old machine passed the same SHA
(weekly-QA baseline 2026-09-27), with the same Playwright 1.62.1. The spec is unchanged since
`c8bcd8de`. It's not a regression.

**What should happen:** the test opens each form Select, checks its localized options, closes
only the Select, and then creates an exercise in the still-open sheet.

**Root cause (observed):** a scratch probe counted `role=dialog` and `role=listbox` elements around
each Escape inside `ExerciseFormSheet`, a Radix `Sheet` holding Radix `Select`s.
- **Escape 0 ms after the listbox was visible:** it closed the Select **and** the Sheet (dialogs
  1 → 0, focus on BODY) in 2 of 3 attempts.
- **Escape after a wait:** at 50, 100, 150, 250, 400 and 700 ms, the Sheet was kept 3 of 3 at
  each delay, and focus returned to the combobox.
- The keydown reached the `option` element un-prevented in both cases.

For roughly the first 50 ms after a Select opens, the Sheet's layer takes Escape. The spec
presses Escape straight after its `toBeVisible` assert. The faster machine lands inside that
window, and the old one didn't.

**Test-only, not user-facing:** no person presses Escape within ~50 ms of a dropdown appearing.

**Affected specs:**
- Dev: `training.exercises` (rules 1 and 3, types and difficulty labels). The spec is correct.
- Business: `coach-builds-exercise-library`: no drift.

### Change Plan (Type 7: correct spec, wrong test)

**Test file:** `frontend/apps/web/e2e/exercise-management/exercise-labels-i18n.spec.ts`

1. Red first on this machine (today it's 4/4 red on `8ead1d1b7`).
2. Close the two form Selects by clicking the already-selected option ("Attack", "Beginner")
   instead of pressing Escape. Their values don't change.
3. Before line 60, assert that the heading "New Exercise" is still visible, so a lost sheet
   fails at the step that lost it.
4. Run it alone ×3 on this machine, and in its shard.

Seven other E2E specs press Escape once each. All passed in the same gate on this machine.

### Resolution

- Spec changes: none (`training.exercises` is correct).
- Tests modified: `exercise-labels-i18n.spec.ts`. Each form Select is now closed by clicking its current
  option ("Attack", "Beginner") with `listbox` count 0 asserted, and the "New Exercise" heading is asserted
  before Create. The filter Escapes stay, since they're outside any sheet.
- Code changes: none.
- Evidence, new Mac, alone, reseeded each run:
  - Unchanged spec at `15c63e9e7`: 1 failed (the spec:60 timeout).
  - Fixed spec at `7c6ea0165`: 1 passed ×3 (16.7 s, 12.1 s, 12.5 s).
- Resolved: 2026-09-29T13:57:38Z (PAD-468).
