---
id: B-173
title: "A test's `git init` under a hook's GIT_DIR re-initialised the shared repository as bare"
type: test-defect
severity: high
status: resolved
affects:
  - backend/padel_app/tests/test_pad398_qa_reset_guards.py
  - backend/padel_app/tests/test_every_test_file_is_collected.py
  - backend/padel_app/tests/test_public_knowledge_layer_guard.py
  - backend/padel_app/tests/conftest.py
  - frontend/packages/config/src/every-test-file-is-collected.test.ts
  - .githooks/prepush-gate.sh
proposed_fix: "Every git a test starts gets env=git_env() (no `git rev-parse --local-env-vars`); conftest drops them from os.environ; a guard plants GIT_DIR at a scratch worktree and scans every test's git call."
opened: 2026-09-24T18:22:21Z
resolved: 2026-09-24T18:44:32Z
---

# B-173 — a test's `git init` under a hook's GIT_DIR made the shared repository bare

**Source:** a machine-wide incident, 2026-09-24. The shared `.git/config` had `core.bare=true`
from 18:22:21 to 18:29:57 UTC, and again from 18:38 UTC. In that time git failed in every worktree
subfolder ("must be run in a work tree"). The coordinator found the root cause.

**What happens:** git runs a hook with its repository variables exported. In a worktree that
means `GIT_DIR=<main>/.git/worktrees/<name>`. The pre-push gate (#409), before #416, passed them on
to pytest. `test_pad398_qa_reset_guards._checkout` ran `git init -q <tmp>/levapp-qa` through
`_git(root, "init", …)`, which inherits the environment. GIT_DIR overrides both the path and
`-C`, so git re-initialised the shared repository and wrote `core.bare = true` into the common
config.

**What should happen:** a test's git finds its repository from its own `-C` or cwd, never from
the caller's environment. No test can touch a repository it did not create.

**Root cause:** the tests were wrong, not a spec (type 7). Four test call sites started git, or a
script that runs git, with the inherited environment:
- the QA-reset harness (`_git`; `_run`, which launches `reset-qa-db.sh`, itself running
  `git -C "$QA_CHECKOUT"`; and the tracked-script check);
- `test_every_test_file_is_collected.files_defining_tests`;
- `test_public_knowledge_layer_guard.tracked_knowledge_files`;
- the frontend `every-test-file-is-collected.test.ts` (its `git ls-files` and its vitest and
  playwright list children).

#416 already stopped the gate from leaking GIT_DIR. It could not help a suite started from any
other hook, or by a caller that exports GIT_DIR.

**Evidence (Phase 1):**
- A scratch repository with one linked worktree, `GIT_DIR` set to that worktree's gitdir, and the
  unmodified pad398 tests: scratch `core.bare` false → true. 2 of the 8 tests failed and 5 errored.
- With `GIT_DIR` pointing at a plain scratch `.git` (no worktree), `core.bare` did not flip. The
  worktree gitdir is what makes `git init` rewrite the common config.

**Affected specs:** none. This is test infrastructure; no product behaviour changed.

### Change Plan (type 7, executed)

1. `backend/padel_app/tests/git_env.py`: `git_env(base=None)` returns the environment without
   `git rev-parse --local-env-vars`, falling back to git 2.4x's list.
2. `conftest.py` pops those variables from `os.environ` at session start.
3. Every git a backend test starts passes `env=git_env()`. The QA harness's `_run` builds the
   script's environment from `git_env()`.
4. The frontend collection test builds `childEnv()` (no `VITEST*`, no repository variables) for
   its git and its list children.
5. `test_b173_test_git_runs_clean.py` guards the rule:
   - It plants GIT_DIR at a SCRATCH worktree's gitdir. A raw `git init` then makes the scratch
     repository bare, which is the R-034 instrument.
   - The QA harness and both repository-scanning guards leave it alone and read this repository.
   - Statically: every backend test subprocess passes `env=`, and git calls pass `git_env`; every
     frontend test git call passes `env:`.

### Resolution

- Tests: `test_b173_test_git_runs_clean.py` (6 cells). Red-first: the static guard, run against
  staging's versions of the files, failed 4 of its cells, each for its own reason: scratch bare
  `true`; the knowledge guard listed `[]`; the three unclean call sites named.
- The 2×2 (pad398 tests, the whole session's GIT_DIR at a scratch worktree):

  | code | GIT_DIR planted | clean |
  |---|---|---|
  | old | 2 failed, 5 errors; scratch `core.bare=true` | 8 passed; `false` |
  | new | 8 passed; `false` | 8 passed; `false` |

  The shared repository read `core.bare=false` before and after every cell.
- Frontend: under a planted GIT_DIR the collection test passes 2/2. With the gate's GIT_DIR, before
  #416, it failed with 332 files flagged.
- Code: `6ece6b709`. Resolved 2026-09-24T18:44:32Z (the fix commit's time).
