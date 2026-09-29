---
id: B-232
title: "E2E attendance-save (PAD-64 US-20) read the roster's first row, which was another spec's student once the order flipped"
type: test-defect
severity: medium
status: resolved
affects:
  - classes.instance-enrollment
  - frontend/apps/web/e2e/schedule-calendar/attendance-save.spec.ts
proposed_fix: "Scope the Present toggle and the state read to the seeded student's row by exact name, and assert no other row's state changed."
opened: 2026-09-29T14:31:37Z
resolved: 2026-09-29T14:31:37Z
---

# B-232: attendance-save read whichever roster row came first

**Source:** Linear PAD-465, from the weekly health runs of 2026-09-27 and 09-28, and Session-E's wave-8 gate
(2026-09-29): shard 3/4, position 63/129, `8ead1d1b7`.

**What happens:** `attendance-save.spec.ts:105` US-20 fails with
`getByTestId('attendance-state').first()`: Expected `"attended"`, Received `"coming"`. It happens only after other
specs have run, and the file passes alone.

**What should happen:** the test marks the seeded "E2E Student" Present on "E2E Academy Class", saves, reloads,
and reads that student's own row back as `attended`.

**Root cause (observed):**
1. **The class is shared, and another spec leaves a second student on it.** API probes between spec files
   (`GET /lesson_instance/1/presences`) show that from `reminder-flow.spec.ts` US-REM-03 onwards, e2e-student-2
   is enrolled as confirmed/`coming`. That holds at every later point, in passing runs as well as failing ones.
   There's no cleanup.
2. **The test's locators take the first row.** It uses `getByRole('button', {name: /^present$/}).first()` to mark
   and `getByTestId('attendance-state').first()` to read.
3. **The roster's order was undefined, and it flipped across the save** (B-233). The failure screenshot shows
   "Participants (2/6)": E2E Student Two "Going" first, and E2E Student "Attended" second. So the save worked and
   marked the right student, who was first when marked. After the reload that student was second, and the read
   took Student Two's `coming`.

**Refuted:** the ticket's statement that reminder-flow was ruled out. Its 10/10 pass with attendance-save had the
pollution present, and the order happened to favour the test. Also refuted: the title-lookup hypothesis
(`getByText(title).first()`), since the screenshot shows the right class open. A bisection of shard 3's 27
preceding files showed that no single half reproduces it, which fits order luck rather than one culprit spec.
Why a longer prefix flips the order more often is layout-dependent and wasn't verified.

**Affected specs:**
- Dev: `classes.instance-enrollment` (rule 12 is what the fixed server guarantees). The test encodes US-20
  correctly in intent, but read a row that wasn't the seeded student's.
- Business: no drift.

### Change Plan (Type 7: correct spec, wrong test)

1. Red: an app-side mutant ordering the roster "unvalidated first, then player id" flips the order across a
   save. With `reminder-flow.spec.ts` as the prefix, the old test reads `coming`.
2. Scope both the toggle and the state read to `attendance-row` filtered by the exact text "E2E Student".
   ("E2E Student Two" contains "E2E Student", so `hasText` isn't enough.)
3. Assert that the other rows' states, sorted, are the same before the save and after the reload. That catches
   a save that marked the wrong student, which `.first()` could hide.
4. The 2×2: old/new test × mutant/fixed server, each with the reminder-flow prefix.

Left out on purpose: reminder-flow cleaning up its enrolment. It would change what the 66 downstream specs of
shard 3 see, and the locator fix doesn't need it.

### Resolution

- Spec changes: none for the test (`classes.instance-enrollment` rule 12 comes from B-233).
- Tests modified: `attendance-save.spec.ts`.
  - The toggle and the state read are scoped to `seededRow()`: `attendance-row` filtered by the exact text
    "E2E Student".
  - The other rows' states, sorted, are asserted equal before the save and after the reload.
- Code changes: none for this entry.
- Evidence: the 2×2 with the reminder-flow prefix, on `feature/pad-465` (base `0e40e3a68`), s5 stack.

  | Cell | Test | Server | Result |
  |---|---|---|---|
  | C1 | old | flip mutant ("unvalidated first, then player id") | 1 failed: Expected `"attended"`, Received `"coming"` at `:109:5`, PAD-465's exact assertion |
  | C2 | new | flip mutant | 10 passed |
  | C3 | old | name order | 10 passed (the name order happens to put E2E Student first) |
  | C4 | new | name order | 10 passed |

  In context, shard 3's 27 preceding files plus the target: attendance-save passed. The one failure in that run
  was `create-player-level-dropdown` PAD-29, the B-231 Escape family, which passes alone and is reported
  separately.
- Resolved: 2026-09-29T14:31:37Z (PAD-465).
