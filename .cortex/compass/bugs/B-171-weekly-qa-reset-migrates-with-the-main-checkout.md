---
id: B-171
title: "The weekly QA sweep's database reset migrated and seeded levelup_qa with the main checkout's backend, not the code under test"
type: incomplete-rule
severity: high
status: resolved
affects:
  - .claude/skills/weekly-qa/SKILL.md
  - docs/qa/scripts/reset-qa-db.sh
proposed_fix: "A tracked reset script next to the skill that takes QA_CHECKOUT and QA_COMMIT explicitly and refuses before touching the database; step 2 calls it from the QA checkout; step 13 names the schema head."
opened: 2026-09-22T20:10:00Z
resolved: 2026-09-22T20:30:00Z
---

# B-171 — the weekly QA reset built the QA database from the wrong tree

**Source:** PAD-398, filed by the weekly QA sweep on 2026-09-22 (a tooling defect, not product).
Diagnosed and fixed by Session-C.

**What happens:** Phase 0 step 1 (PAD-333) builds `~/levapp-qa` at `origin/staging` as the code
under test. Step 2 then runs `bash "$MAIN/docs/qa/scripts/reset-qa-db.sh"`. That script sets
`BACKEND_DIR` and `SEED_SCRIPT` relative to its own path, so `flask db upgrade` and `seed.py` run
from the main checkout — a human tree parked on any branch.

**Observed (2026-09-22 20:07 UTC, reproduced without touching a database):** evaluating the
script's two path lines as the skill invokes it gives
`BACKEND_DIR=/Users/pedropacheco1/Documents/Projetos/padel_app/levapp/backend`. The main
checkout was `feature/pad-197` @ `7de36cb3b` with **46** migrations; `origin/staging` had **84**.
`git check-ignore` names `.gitignore:35: docs/`, so the script is never in the QA checkout: the
skill has no copy to call there, and step 2 points back at `$MAIN` on every run.

**What should happen:** the QA database is migrated and seeded by exactly the commit the run
tests, and the run aborts when that cannot be guaranteed.

**Which observation selected the type:** no `.specflow` spec governs the QA harness. By design
it is tooling, and its contract is the `weekly-qa` skill itself. Phase 0 step 1 pins the *code*
under test to a known commit, but no rule pinned the *data* under test (schema and seed) to the
same tree. The contract exists and is missing a rule: incomplete-rule.

**Affected specs:** none in `.specflow` (tooling). Contract: `.claude/skills/weekly-qa/SKILL.md`
Phase 0 steps 2 and 13.

### Change Plan (executed)
1. Track the script at `.claude/skills/weekly-qa/scripts/reset-qa-db.sh`, so the QA checkout
   carries the copy that matches its migrations and seed.
2. It requires `QA_CHECKOUT` (env or first argument) and `QA_COMMIT`. It aborts, before any
   `psql`, when:
   - the checkout is not the top of a git worktree;
   - HEAD is not `QA_COMMIT`;
   - migrations/ or the seed have local changes;
   - the migration count on disk differs from the commit's;
   - `padel_app` imports from another tree.
   After `flask db upgrade` it checks that current = heads, and it prints
   `QA_SCHEMA_HEAD=<rev>`.
3. Skill step 2 calls it from `$QA_CHECKOUT` with both variables. Step 13's `Ran against:` line
   gains `schema <QA_SCHEMA_HEAD>`.
4. `QA_RESET_DRY_RUN=1` runs every guard and touches no database. The tests use it.

### Resolution
- Script: `.claude/skills/weekly-qa/scripts/reset-qa-db.sh` (new, tracked). Skill: step 2 and
  step 13.
- Tests: `backend/padel_app/tests/test_pad398_qa_reset_guards.py`, 8 cells against throwaway
  repositories (unset, no commit, a parked tree at another commit, not a worktree, a stray
  migration, the right tree, the argument form, tracked). Dropping the commit guard reddens
  the parked-tree cell.
- Dry runs on this machine: the main checkout with staging's commit → abort ("is at 7de36cb3b,
  not the QA_COMMIT 84c125938"); `~/levapp-qa` at its commit → every guard passes.
- The old gitignored copy in the main checkout is replaced by a stub that aborts and points
  here, so a stale skill copy cannot run it.
- Not run: a real reset of `levelup_qa`. It drops a shared database; the next weekly sweep
  exercises it.
