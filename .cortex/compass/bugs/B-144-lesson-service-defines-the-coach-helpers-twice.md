---
id: B-144
title: "lesson_service.py defined coaches_for, primary_coach and coach_instance_ids twice; the later copies shadowed the earlier"
type: test-defect
severity: low
status: resolved
affects:
  - classes.coach-assignment
  - backend/padel_app/services/lesson_service.py
proposed_fix: "Delete the first, dead copy of the section; a pytest AST scan fails on any top-level name defined twice in the backend package."
opened: 2026-09-21T20:09:19Z
resolved: 2026-09-22T20:29:59Z
---

# B-144 — the coach helpers were defined twice

**Source:** PAD-384, found by Session-D on 2026-09-21 while reading for PAD-382, by diff only.
Ledger id from Session-D's range; fixed by Session-C.

**What happens:** `backend/padel_app/services/lesson_service.py` carried the whole "Coaches of an
occurrence (PAD-275, classes.coach-assignment rule 4)" section twice. The ticket named only
`coach_instance_ids`; the scan found three functions: `coaches_for` (lines 218 and 499),
`primary_coach` (272 and 553) and `coach_instance_ids` (279 and 560). Python binds the later copy,
so an edit to the earlier one would change nothing and fail nothing. `git log -L` attributes the
section to two PAD-275 commits (`00d990438`, `0e5e7dc22`); it landed twice through a merge.

**Measured (2026-09-22, origin/staging 84c125938):**
- AST: lines 218–298 are byte-identical to 499–579 (header comment included), and no
  module-level statement names these functions.
- `inspect.getsourcelines` on the imported module: the bound definitions are lines 499, 553 and
  560, so every caller gets the later copy today. No behaviour was wrong.
- A scan of every module in `padel_app/` (excluding tests and migrations) found no other
  redefined top-level name.

**Which observation selected the type:** the rule (`classes.coach-assignment` rule 4: one answer
to "which occurrences does this coach coach") is right, and the code honours it through the
bound copy. What was missing is a check that fails when a module shadows its own definition:
flake8's F811 would, but flake8 is not run in CI. So: test-defect.

### Resolution
- The first copy is deleted (87 lines, header included). The top-level names are unchanged
  (42 definitions → 39), and the removed text appears verbatim in the kept section.
- `test_pad384_no_top_level_name_is_defined_twice.py`: red on staging (names the three), green
  after. The 43 test files that touch lesson_service or these helpers give 573 passed (SQLite).
