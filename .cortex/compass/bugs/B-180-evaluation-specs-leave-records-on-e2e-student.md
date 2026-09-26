---
id: B-180
title: "Two evaluation specs left an evaluation record on E2E Student, so evaluation-reminder's 'never evaluated, so due' fixture failed in a full run"
type: test-defect
severity: medium
status: resolved
affects:
  - frontend/apps/web/e2e/evaluation-tools/evaluation-flush-on-hide.spec.ts
  - frontend/apps/web/e2e/evaluation-tools/evaluation-persist.spec.ts
  - frontend/apps/web/e2e/helpers/cleanup.ts
proposed_fix: "Snapshot E2E Student's evaluation record ids before each test and delete the ones the test created after it (cleanup.ts: evaluationRecordIds / removeEvaluationRecordsSince)."
opened: 2026-09-25T01:03:44Z
resolved: 2026-09-25T12:57:11Z
---

# B-180: evaluation specs leave records on the shared student

**Source:** PAD-452, from the nightly test-health run (2026-09-25) on staging `86523d0bd`. Two of its five full-run-only failures:
- `settings/evaluation-reminder.spec.ts:88`, where the players list should show a due marker;
- `:115`, where the class evaluation panel should show a due marker.

**What happens:** evaluation-reminder relies on the seed never evaluating "E2E Student" for `e2e-coach`, so "monthly" marks them due (evaluations.reminders rule 3). Two earlier specs file today's record on that student and never delete it:
- **`evaluation-flush-on-hide`:** each test's note edit upserts the record. Its `afterEach` deletes only the categories it created.
- **`evaluation-persist`:** its star rating upserts the record. It has no cleanup.

**What should happen:** a spec that writes to a shared seeded user puts it back (PAD-341, `helpers/cleanup.ts`).

**Root cause:** Type 7, missing test cleanup. The reminder rule and its implementation are correct: a student with a record this month is not due.

**Evidence (Phase 1, 2026-09-25):**
- `evaluation-tools/` then `evaluation-reminder` gives 2 failed (`player-due-1` and `class-eval-due-1` not found).
- The isolated DB afterwards holds record 9 on coach_player 1, created at the `PUT /evaluation_record` inside flush-on-hide's `:80` test. Its "Forehand" = 4 entry was written inside evaluation-persist's test on the same day's record.
- Each polluter alone, followed by the reminder, turns both reminder tests red.
- With the fix: `evaluation-tools/` + `evaluation-category-delete` + reminder gives 28/28. flush-on-hide + persist alone give 3/3, and reminder alone gives 2/2.

### Change Plan (Type 7)
1. `helpers/cleanup.ts`: `evaluationRecordIds(request, auth, playerId)` and `removeEvaluationRecordsSince(request, auth, playerId, before)`. The deletion is a soft assertion, following the file's convention.
2. `evaluation-flush-on-hide`: snapshot in `beforeEach`. `afterEach` always deletes the new records, then the categories; before, it returned early when no category was created.
3. `evaluation-persist`: the same snapshot and cleanup.

### Resolution
- **Spec changes:** none.
- **Tests changed:** `helpers/cleanup.ts` gains `evaluationRecordIds` and `removeEvaluationRecordsSince`, and evaluation-flush-on-hide and evaluation-persist snapshot the record ids and delete what they created.
- **2×2:**
  - old: reminder alone 2/2; each polluter followed by the reminder gives 2 failed;
  - new: flush-on-hide + persist 3/3; `evaluation-tools/` + category-delete + reminder 28/28.
- **Full serial run** on `4732da3d9`: both evaluation-reminder tests pass.
- **Code changes:** none.
- **Resolved:** 2026-09-25T12:57:11Z, commit `4732da3d9` (PAD-452).
