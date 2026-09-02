# Known Failures — do NOT file these as regressions

Tests/flows that fail (or are skipped) on `main` for reasons unrelated to the current week's work. The weekly QA sweep excludes these from regression detection. Keep this list curated — remove an entry once the underlying issue is fixed.

## Web (Playwright)

| Spec | Test | Why | Status |
|---|---|---|---|
| `settings/coach-settings.spec.ts` | US-69: skill levels management is accessible from settings | COVERAGE NOTE (not a failure): test uses a conditional `test.skip(true, "Skill levels section not found in settings")`, so it silently self-skips instead of asserting. Skill-levels management IS present/functional (Settings → Preferences → Coach Levels; PAD-84 ordering-hint specs pass). Update the locator so it stops masking coverage. | coverage-note (2026-07-26) |

<!-- Removed 2026-07-26: ticket-pad-24-loading-states "class delete shows loading state…" — the test was updated to click through the PAD-58 confirm dialog and now PASSES (2026-07-26 run). Exclusion no longer needed. -->
<!-- Removed 2026-07-21: exercise-crud.spec.ts US-48 and US-16 — both passed on 2026-07-12 AND 2026-07-21 (two consecutive green runs); exclusions were stale and masking potential real failures. -->

_iOS Maestro suite not run this cycle (scheduled-run computer-use limitation)._

## iOS (Maestro)

| Flow | Why | Status |
|---|---|---|
| `08-set-player-level.skipped` | Select/dropdown portal not drivable on iOS simulator | intentionally skipped |

## Notes

- Add an entry here (rather than filing a ticket) whenever the sweep surfaces a failure that is confirmed to already exist on `main` and is out of scope for QA to fix.
- Each entry should say *what* fails and *why*, so a future sweep (or person) can tell when the exclusion is stale.
