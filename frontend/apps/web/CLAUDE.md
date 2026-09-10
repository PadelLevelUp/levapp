# LevelUp Web App (`@levelup/web`)

React + Vite web shell. Playwright E2E lives in `e2e/`, and `playwright.config.ts` is here — E2E must be run from this directory (or via the repo-root npm scripts).

## E2E Tests

```bash
source ../../../.claude/secrets.env              # POSTGRES_PW required
kill $(lsof -ti :5001) 2>/dev/null; kill $(lsof -ti :8080) 2>/dev/null; sleep 1  # Kill stale servers
npx playwright test                              # All E2E (headless), from apps/web/
npx playwright test e2e/<folder>/<name>.spec.ts  # Specific spec, from apps/web/
```

From the frontend repo root the equivalents are `npm run test:e2e:headless` (headless), `npm run test:e2e` (headed), `npm run test:e2e:ui` (interactive UI mode) and `npm run test:e2e:reset` (reset the test DB only).

E2E tests start their own Flask server on port 5001 with the `levelup_test` DB (Postgres port 5432). The DB is dropped, recreated, migrated, and seeded before each run via `reset-test-db.sh`.

**Important:** Kill any running Vite dev server on port 8080 before E2E tests. Playwright reuses it (`reuseExistingServer: !process.env.CI`), but the dev server proxies to port 5000 (dev DB), not 5001 (test DB), causing login failures. On macOS, `lsof` combined port syntax (`:5001,:8080`) doesn't work — kill ports separately.

## E2E Testing Patterns

- Login helpers: `loginAsCoach(page)`, `loginAsStudent(page)` from `e2e/helpers/auth.ts`
- Navigation helpers: `openCalendar(page)`, `openPlayers(page)`, etc. from `e2e/helpers/navigation.ts`
- Test naming: `"US-XXX: description"` for traceability
- Locator priority: `getByRole` > `getByPlaceholder` > `getByLabel` > `getByText` > CSS class (last resort)
- Seeded data (`e2e/scripts/seed.py`): coaches `e2e-coach` and `e2e-coach-nolevels` (same club, deliberately no `CoachLevel` rows — the empty-levels-dropdown case; use `loginAsCoachNoLevels`), students `e2e-student` / `e2e-student-2`, class "E2E Academy Class" on next Monday 10:00. Every fixture date comes from `e2e/scripts/seed_dates.py` (PAD-223) — one pure function of `today`, proven collision-free on all seven weekdays by `e2e/scripts/test_seed_dates.py` (`python -m pytest frontend/apps/web/e2e/scripts` from the backend venv); `E2E_SEED_TODAY=YYYY-MM-DD` pins the anchor to reproduce a run on another weekday. Add new dated fixtures there, never inline
- Workers: 1 (serial), timeout: 3 minutes
