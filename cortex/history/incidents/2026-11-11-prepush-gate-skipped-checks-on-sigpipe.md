---
about: "The pre-push gate piped its changed-file list into grep -q under pipefail, so on a long diff a check whose paths matched was skipped silently"
permanence: stable
verified: "2026-11-11 (observed)"
origin:
  - commit:63a7555fc
need:
  - .githooks/prepush-gate.sh
aliases:
  - B-726
  - B-726-prepush-gate-skipped-checks-on-sigpipe
---

# B-726: the pre-push gate skipped checks when grep -q SIGPIPEd its input

**Source:** PAD-905 (Cortex 4.0 step 6), 2026-11-11. Fixed in PR #929, which the coordinator landed
ahead of PAD-905 so the specs branch's push would run a trustworthy gate.

**What happened:** `.githooks/prepush-gate.sh` runs under `set -uo pipefail`. Its path selectors
were `changed() { printf '%s\n' "$CODE_CHANGED" | grep -qE "$1"; }` and the same for
`changed_any()`. `grep -q` exits at its first match; when the list is long enough that printf is
still writing, printf gets SIGPIPE and, under pipefail, the pipeline answers 141, which `if` and
`&&` read as "no match". PAD-905's first push (1260 changed files, `cortex/` matching early) ran
without its `cortex store validate` step, and line 92 printed `printf: write error: Broken pipe`;
the summary still said "all checks passed".

**What should happen:** a check whose paths changed runs, whatever the size of the diff.

**Root cause:** a pipe into `grep -q` under pipefail. The failure depends on timing and list size,
so it skipped checks on large pushes (merges, store moves, the 1064-file specs branch) and never on
small ones, which is why nothing caught it.

**Evidence:** `set -o pipefail; printf … (200000 lines) | grep -qE '^cortex/'` → 141;
`grep -qE '^cortex/' <<<"$L"` → 0. After the fix, the same PAD-905 push (e8b8024af, 1260 files) ran
every step, `cortex store validate … ok` included: "pre-push gate: all checks passed (142 s)".

### Resolution
- **Code:** `changed()`, `changed_any()`, the route-module check (d) and step 5's error-line match
  use here-strings, so nothing in the gate pipes into `grep -q`.
- **Test:** none automated; the gate is a shell script with no harness. The reproduction above is
  the check.
- Resolved: 2026-11-11 (PAD-905, PR #929).

<!-- 3.x fields, in the shape cortex migrate gives a ledger entry (filed after the 4.0 move, PAD-905) -->
```yaml
type: incomplete-rule
severity: high
status: resolved
affects:
  - .githooks/prepush-gate.sh
proposed_fix: "Feed grep -q from a here-string, never from a pipe, anywhere the gate runs under pipefail."
resolved: "2026-11-11"
```
