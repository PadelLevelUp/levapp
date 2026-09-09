# LevelUp Web App (`@levelup/web`)

React + Vite web shell. Playwright E2E lives in `e2e/`, and `playwright.config.ts` is here — E2E must be run from this directory (or via the repo-root npm scripts).

## E2E Tests

```bash
source ../../../.claude/secrets.env              # POSTGRES_PW required
npx playwright test                              # All E2E (headless), from apps/web/
npx playwright test e2e/<folder>/<name>.spec.ts  # Specific spec, from apps/web/
```

From the frontend repo root the equivalents are `npm run test:e2e:headless` (headless), `npm run test:e2e` (headed), `npm run test:e2e:ui` (interactive UI mode) and `npm run test:e2e:reset` (reset the shared test DB only).

**Isolation (PAD-218).** Every checkout gets its own stack by default: `e2e/isolation.ts` derives a database name (`levelup_e2e_<8 hex of the checkout path>`) and a backend/Vite port pair (5100–5399 / 8100–8399) from the `apps/web` path, and `global-setup` resets *that* database before the run. Two worktrees can therefore run their suites at the same time without wiping each other's seed or fighting over ports. The env still wins, field by field:

| Variable | Effect |
| --- | --- |
| `E2E_DB_NAME`, `E2E_BACKEND_PORT`, `E2E_WEB_PORT` | pin any of the three (e.g. `E2E_DB_NAME=levelup_e2e_c E2E_BACKEND_PORT=5013 E2E_WEB_PORT=8093`) |
| `E2E_SHARED=1` | the single-session shared stack: `levelup_test` on 5001/8080 — what `npm run test:e2e:reset` resets |
| `E2E_SEED_TODAY=YYYY-MM-DD` | pin the seed's "today" (PAD-223) |

`global-setup` prints the stack it resolved and **refuses to start** — without touching any database — when another Playwright run holds the target database: each run writes a lock file (`$TMPDIR/levapp-e2e-<db>.lock`, live only while the pid inside it is alive) that `global-teardown` releases. A port probe cannot do this job because Playwright starts the configured webServers *before* `global-setup` runs, so the run's own backend is always already listening. A bare `npm run test:e2e:reset` honours the same lock and additionally refuses to reset `levelup_test` while something listens on 5001 (it has no backend of its own, so that listener is somebody else's run) — both checks sit *before* it terminates connections. Never kill processes by name (`pkill -f playwright|vite|flask`) to "clean up": other sessions' suites share this machine — kill only PIDs you started, or `lsof -ti :<your port>`.

The E2E backend runs Flask on the resolved port against the resolved Postgres database (port 5432); Vite is started on the resolved web port with `VITE_BACKEND_PORT` pointing at it, so the proxy never hits the dev DB on 5000. Playwright reuses an existing Vite on that port (`reuseExistingServer: !process.env.CI`), which only matters if you started one yourself.

## E2E Testing Patterns

- Login helpers: `loginAsCoach(page)`, `loginAsStudent(page)` from `e2e/helpers/auth.ts`
- Navigation helpers: `openCalendar(page)`, `openPlayers(page)`, etc. from `e2e/helpers/navigation.ts`
- Test naming: `"US-XXX: description"` for traceability
- Locator priority: `getByRole` > `getByPlaceholder` > `getByLabel` > `getByText` > CSS class (last resort)
- Seeded data (`e2e/scripts/seed.py`): coaches `e2e-coach` and `e2e-coach-nolevels` (same club, deliberately no `CoachLevel` rows — the empty-levels-dropdown case; use `loginAsCoachNoLevels`), students `e2e-student` / `e2e-student-2`, class "E2E Academy Class" on next Monday 10:00
- Workers: 1 (serial), timeout: 3 minutes
