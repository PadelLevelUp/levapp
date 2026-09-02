# QA Baseline

The baseline is how the weekly QA sweep tells a **new** problem from a **pre-existing** one. Without it, every run would re-report the same design nits and known-flaky tests as if they were fresh regressions.

## Files

- `baseline-latest.json` — written at the end of every run (Phase 4, step 14). Holds:
  - `regression`: map of `spec/flow id → pass|fail` from Phase 1.
  - `design`: per-screen rubric scores from Phase 3 (`screen → { platform, scores{}, worst_severity }`).
  - `run_date`: the date this baseline was captured.
  - Created fresh on the **first (calibration) run** — absent until then.
- `known-failures.md` — human-curated list of tests/flows that fail on `main` for reasons unrelated to this week's work. The sweep must NOT file these as regressions.

## Diff rules (Phase 1 & 3)

- **Regression** = a spec/flow that was `pass` in `baseline-latest.json` and is `fail` this run, AND is not in `known-failures.md`. → P1 candidate, auto-file.
- **Fixed** = was `fail`, now `pass`. → note in report's week-over-week delta; if a matching open PAD ticket exists, comment that it appears resolved.
- **Persisting** = `fail` both runs. → report only, don't refile.
- **Design regression** = a screen whose `worst_severity` got worse than baseline, or a new P0/P1 finding on a screen that was clean. → auto-file if P0/P1.

## First-run behavior

On the calibration run (`baseline-latest.json` absent): produce the full report and write the baseline, but **auto-file nothing** — surface findings to the user to tune the severity gate first. Enforcement (auto-filing) begins on run 2.
