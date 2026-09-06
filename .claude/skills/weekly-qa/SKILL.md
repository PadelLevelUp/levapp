---
name: weekly-qa
description: Run the weekly QA sweep across the LevelUp web and iOS apps — regression suites, exploratory user-journey walks, and vision-based design critique — then auto-file P0/P1 findings to Linear and save a dated report. Use this skill whenever the user says "/weekly-qa", "run the weekly QA", "do the QA sweep", "QA the apps", or when the Sunday scheduled task invokes it. Runs locally (needs the Mac awake) because iOS testing drives the simulator via computer-use.
---

# Weekly QA

Walk the LevelUp web and iOS apps like a real coach and student every week: confirm nothing regressed, discover functional bugs no scripted test asserts on, and score the design against a fixed rubric. Emit one dated report; auto-file only the worst (P0/P1) findings as Linear tickets so the backlog doesn't flood.

This runs **locally** on the user's Mac (iOS uses the simulator + computer-use, which needs a live GUI session). It is invoked by a Sunday-8pm scheduled task or by hand.

**Delegate the work.** Each journey and each design-critique screen is an independent subagent. Fan them out in parallel; the main agent only orchestrates, diffs against baseline, and files tickets.

## Inputs (versioned, tunable)

- `docs/qa/journeys.yaml` — the canonical user journeys to walk (web + iOS, per role).
- `docs/qa/design-rubric.md` — the fixed design-scoring rubric and severity mapping.
- `docs/qa/baseline/baseline-latest.json` — last run's results, for diffing. Absent on the very first (calibration) run.
- Linear target: team **PadelLevelUP** (`PAD` prefix), id `3d428a41-d6d4-4c7d-a400-6fdfefdfbe77`.

## Ports & DBs (QA is fully isolated)

| Env | DB | Backend port | Notes |
|---|---|---|---|
| dev | `levelup` | 5000 | never touched by QA |
| E2E | `levelup_test` | 5001 | never touched by QA |
| **QA** | **`levelup_qa`** | **5002** | this skill only |

## Steps

### Phase 0 — Setup

1. Pre-flight: load secrets and clear any stale QA servers (macOS: kill ports separately, combined `lsof` syntax fails).
   ```bash
   source /Users/pedropacheco1/Documents/Projetos/padel_app/levapp/.claude/secrets.env
   kill $(lsof -ti :5002) 2>/dev/null; kill $(lsof -ti :8080) 2>/dev/null; sleep 1
   ```
2. Reset + seed the isolated QA database:
   ```bash
   bash /Users/pedropacheco1/Documents/Projetos/padel_app/levapp/docs/qa/scripts/reset-qa-db.sh
   ```
3. Boot the QA backend (from `levelup_backend`, `.venv` active):
   ```bash
   cd /Users/pedropacheco1/Documents/Projetos/padel_app/levapp/backend
   source .venv/bin/activate
   FLASK_ENV=development POSTGRES_DB=levelup_qa POSTGRES_HOST=localhost \
     flask run --port 5002 --no-reload &
   ```
   Health-check `http://localhost:5002/api/app/healthz` before proceeding.
4. Boot the web frontend against QA:
   ```bash
   cd /Users/pedropacheco1/Documents/Projetos/padel_app/levapp/frontend/apps/web
   VITE_BACKEND_PORT=5002 npm run dev &   # serves on 8080
   ```
5. Boot the iOS simulator against QA (iPhone 17 Pro, per mobile E2E convention):
   ```bash
   cd /Users/pedropacheco1/Documents/Projetos/padel_app/levapp/frontend/apps/mobile
   EXPO_PUBLIC_API_URL=http://localhost:5002/api npx expo run:ios &
   ```
   Grant computer-use access to the Simulator via `request_access` when driving it.

### Phase 1 — Regression (deterministic, binary)

6. Run the web Playwright suite and the iOS Maestro workspace, capturing pass/fail per spec/flow.
   ```bash
   # Web — note: Playwright's own webServer uses levelup_test:5001, independent of QA above
   cd /Users/pedropacheco1/Documents/Projetos/padel_app/levapp/frontend/apps/web
   kill $(lsof -ti :5001) 2>/dev/null; kill $(lsof -ti :8080) 2>/dev/null; sleep 1
   bash e2e/scripts/reset-test-db.sh && npx playwright test --reporter=json
   # iOS
   cd /Users/pedropacheco1/Documents/Projetos/padel_app/levapp/frontend/apps/mobile
   bash scripts/e2e.sh
   ```
7. Diff results against `docs/qa/baseline/baseline-latest.json`. A spec that **passed last week and fails now** is a P1 regression candidate. Pre-existing failures (see the known-flaky list in `docs/qa/baseline/known-failures.md`) are NOT regressions — do not file them.

### Phase 2 — Exploratory walk (agent-as-user, parallel)

8. For each journey in `docs/qa/journeys.yaml`, spawn a subagent that drives the **real running app** (web → Chrome MCP against `http://localhost:8080`; iOS → computer-use against the Simulator). Fan them out in parallel, grouped by platform (web journeys can run concurrently; iOS journeys are serial — one simulator).
   Each subagent: performs the steps, verifies `expected`, and records everything in `capture` — screenshots, console errors (`read_console_messages`), failed network requests (`read_network_requests`), dead ends, and "worked-but-felt-wrong" notes. It returns a structured finding list with severity per the rubric.
9. Restore any state a journey mutated is unnecessary — the QA DB is disposable and re-seeded next run.

### Phase 3 — Design critique (vision rubric, parallel)

10. Screenshot every key screen on both platforms (web at desktop/tablet/mobile viewports via `preview_resize` or Chrome; iOS in the simulator). For web, capture BOTH light and dark theme.
11. Spawn a subagent per screen that scores it against `docs/qa/design-rubric.md` and emits the rubric's machine-readable summary block (scores per dimension, findings[], worst_severity). Include the **web↔iOS parity** pass: compare the same feature across platforms for visual/label consistency.

### Phase 4 — Report + triage

12. Merge Phase 1–3 outputs into one dated report at `docs/qa/reports/YYYY-MM-DD.md` (pass a timestamp in — do not call Date.now()). Sections: **Regressions │ Functional bugs │ Design findings**, each severity-ranked, with inline screenshot references. Include a week-over-week delta vs baseline (new / fixed / persisting).
13. Auto-file **only P0/P1** findings to Linear team PadelLevelUP:
    - **Dedupe first**: `list_issues` on the PAD team, match by title/screen/journey against open issues. If an equivalent open ticket exists, add a comment noting it recurred this week instead of creating a duplicate.
    - Each new ticket: clear title (`[QA] <severity>: <short desc>`), the reproduction steps, the screenshot (attach), affected platform/route, and a ready-to-run implement-ticket prompt in the description so it can be picked up autonomously.
    - P2/P3 findings stay in the report only.
14. Update the baseline: write this run's results to `docs/qa/baseline/baseline-latest.json` (regression pass/fail map + per-screen design scores) so next week diffs against it.
15. Teardown: kill the QA servers (ports 5002, 8080) and stop the simulator boot if this was an unattended run.

## Patterns & gotchas

- **First run is calibration, not enforcement.** If `baseline-latest.json` is absent, do NOT auto-file anything — every pre-existing design nit would look "new." Instead, write the baseline, produce the report, and surface findings to the user to triage the severity gate. Only later runs auto-file.
- **iOS Select/dropdown portals aren't drivable** via automation (the Maestro `set-player-level` flow is `.skipped`). Don't fail a journey on an interaction that's a known iOS-automation limitation — note it and move on.
- **NativeWind calc() border-radius bug**: `calc()` in mobile `tailwind.config` borderRadius silently drops to square corners. The design rubric flags this specifically — check card/button corners on iOS.
- **Never point QA at dev/E2E DBs.** QA is `levelup_qa` on port 5002. The Playwright regression run (Phase 1) spins its OWN `levelup_test`:5001 webServer — that's expected and separate.
- **iCloud/Vite watcher**: repo is on iCloud Drive; if a web change doesn't reflect, restart Vite. Delete `… 2.ext` conflict-junk files if seen.
- **Serial iOS, parallel web.** One simulator = iOS journeys run one at a time. Web journeys fan out freely.
- **Ticket dedupe is mandatory** — without it the same bug refiles every week and the PAD backlog fills with QA noise.
