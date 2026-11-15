---
about: "guard-main-source.yaml spliced the PR's branch name (github.head_ref) into a run: script, a script-injection pattern"
permanence: stable
verified: "2026-10-22 (observed)"
origin:
  - migrated:compass/bugs/B-665-guard-workflow-spliced-the-pr-branch-name-into-its-script.md@ef7a5f3
need:
  - .github/workflows/guard-main-source.yaml
aliases:
  - B-665
  - B-665-guard-workflow-spliced-the-pr-branch-name-into-its-script
---

# B-665: the main-source guard spliced the branch name into its script

**Source:** actionlint, run over every workflow while PAD-703's were linted (2026-10-22,
la-2110-SessionF): `"github.head_ref" is potentially untrusted. avoid using it directly in inline
scripts` at `guard-main-source.yaml:17`.

**Mechanism:** `${{ github.head_ref }}` inside `run:` is substituted into the script text before
bash parses it. A pull request into `main` from a branch named, for instance, `x";id;"` would run
`id` on the runner. The job has no secrets and a read-only token, which is why the severity is low.
It is still code execution chosen by whoever opens the PR.

**Fix:** the step passes it as `env: HEAD_REF: ${{ github.head_ref }}` and echoes `${HEAD_REF}`.
`test_b665_no_untrusted_text_in_workflow_scripts.py` scans every workflow's `run:` scripts for
the contexts GitHub documents as attacker-controllable (`head_ref`; PR, issue, comment, review and
discussion titles, bodies, refs, labels; commit messages and authors). It fails on the old file
(checked) and passes on the fixed one. The only other `head_ref` use is the step's `if:`, which is
an expression, not a script.

<!-- 3.x fields of compass/bugs/B-665-guard-workflow-spliced-the-pr-branch-name-into-its-script.md, carried verbatim by cortex migrate -->
```yaml
type: incomplete-rule
severity: low
status: resolved
affects:
  - .github/workflows/guard-main-source.yaml
proposed_fix: "Pass untrusted contexts through env: and read them as shell variables; a test scans every workflow's run: scripts for the attacker-controllable contexts."
```
