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

**A report that does not say what it ran against is not evidence, however much detail it
carries.** Steps 1 and 13 exist for that reason: PAD-312 was a detailed, confident ticket —
DB queries, line numbers, a named root cause — filed against a tree three days out of date,
and nothing in it said so. Everything below flows from that.

1. **Resolve the code under test, or abort.** The run uses its OWN checkout, refreshed from
   `origin/staging`, kept OUTSIDE `~/Documents` (that path is iCloud-synced: artifact writes
   send `fileproviderd` to 99% CPU and have driven load past 200, which then *causes* timeouts
   that read as product failures). It must never run from the main checkout — that is a human
   working tree parked on whatever branch someone left, which on 2026-09-13 was
   `feature/pad-197` at a commit from 2026-09-06 — nor from another session's worktree.
   ```bash
   MAIN=/Users/pedropacheco1/Documents/Projetos/padel_app/levapp   # prose home only, see step 12
   QA_CHECKOUT="$HOME/levapp-qa"                                   # code under test
   git -C "$MAIN" fetch origin --quiet || { echo "QA ABORT: cannot fetch origin"; exit 1; }
   [ -d "$QA_CHECKOUT" ] || git -C "$MAIN" worktree add --detach "$QA_CHECKOUT" origin/staging
   git -C "$QA_CHECKOUT" fetch origin --quiet \
     && git -C "$QA_CHECKOUT" checkout --detach origin/staging --quiet \
     || { echo "QA ABORT: cannot refresh $QA_CHECKOUT"; exit 1; }
   QA_COMMIT=$(git -C "$QA_CHECKOUT" rev-parse --short HEAD)
   QA_REF=origin/staging
   QA_STARTED_AT=$(date -Iseconds)
   [ -n "$QA_COMMIT" ] || { echo "QA ABORT: no commit resolved"; exit 1; }
   echo "QA runs against $QA_COMMIT ($QA_REF) at $QA_STARTED_AT"
   source "$QA_CHECKOUT/.claude/secrets.env"
   ```
   **If any of this fails, the run ABORTS: no report, no baseline write, no tickets.** A run
   that cannot say what it tested must not produce a report — otherwise the failure mode moves
   from a stale report to a report with a blank field that people skim past.

1b. **Check the ports are free; never clear them by killing.** Nothing unattended may kill what
   it did not start — an unattended `kill $(lsof -ti :8080)` is the automated form of
   `pkill -f playwright`, which has already destroyed a peer's suite.
   ```bash
   for port in 5002 8080; do
     lsof -nP -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1 \
       && { echo "QA ABORT: port $port is in use by someone else"; exit 1; }
   done
   ```
   Record the PID of every server this run starts (`$!` after each `&`) and kill only those at
   teardown.
2. Reset + seed the isolated QA database:
   ```bash
   bash "$MAIN/docs/qa/scripts/reset-qa-db.sh"
   ```
3. Boot the QA backend (from `levelup_backend`, `.venv` active):
   ```bash
   cd "$QA_CHECKOUT/backend"
   source .venv/bin/activate
   FLASK_ENV=development POSTGRES_DB=levelup_qa POSTGRES_HOST=localhost \
     flask run --port 5002 --no-reload &
   QA_BACKEND_PID=$!
   ```
   Health-check `http://localhost:5002/api/app/healthz` before proceeding.
4. Boot the web frontend against QA:
   ```bash
   cd "$QA_CHECKOUT/frontend/apps/web"
   VITE_BACKEND_PORT=5002 npm run dev &   # serves on 8080
   QA_WEB_PID=$!
   ```
5. Boot the iOS simulator against QA (iPhone 17 Pro, per mobile E2E convention):
   ```bash
   cd "$QA_CHECKOUT/frontend/apps/mobile"
   EXPO_PUBLIC_API_URL=http://localhost:5002/api npx expo run:ios &
   QA_IOS_PID=$!
   ```
   Grant computer-use access to the Simulator via `request_access` when driving it.

### Phase 1 — Regression (deterministic, binary)

6. Run the web Playwright suite and the iOS Maestro workspace, capturing pass/fail per spec/flow.
   ```bash
   # Web — note: Playwright's own webServer uses levelup_test:5001, independent of QA above
   # Ports/DB are derived per checkout by e2e/isolation.ts, so this run cannot
   # collide with a session's stack — and it kills nothing it did not start.
   cd "$QA_CHECKOUT/frontend/apps/web"
   bash e2e/scripts/reset-test-db.sh && npx playwright test --reporter=json
   # iOS
   cd "$QA_CHECKOUT/frontend/apps/mobile"
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

12. Merge Phase 1–3 outputs into one dated report at `$MAIN/docs/qa/reports/YYYY-MM-DD.md`
    (reports and baselines stay in the MAIN checkout — the code under test moved in step 1, the
    prose home did not) (pass a timestamp in — do not call Date.now()). Sections: **Regressions │ Functional bugs │ Design findings**, each severity-ranked, with inline screenshot references. Include a week-over-week delta vs baseline (new / fixed / persisting).
13. **Every artefact states what it ran against, as its FIRST line, not an appendix** — the
    line a reader sees before deciding whether to believe the rest:
    `Ran against: <QA_COMMIT> (<QA_REF>, <QA_STARTED_AT>)`. It goes at the top of the dated
    report, as the first line of every filed Linear ticket, and as a `ranAgainst` field in
    `baseline-latest.json`. A finding without it is not filed.
14. Auto-file **only P0/P1** findings to Linear team PadelLevelUP:
    - **Dedupe first**: `list_issues` on the PAD team, match by title/screen/journey against open issues. If an equivalent open ticket exists, add a comment noting it recurred this week instead of creating a duplicate.
    - Each new ticket: clear title (`[QA] <severity>: <short desc>`), the reproduction steps, the screenshot (attach), affected platform/route, and a ready-to-run implement-ticket prompt in the description so it can be picked up autonomously.
    - P2/P3 findings stay in the report only.
15. Update the baseline: write this run's results, plus `ranAgainst`, to `$MAIN/docs/qa/baseline/baseline-latest.json` (regression pass/fail map + per-screen design scores) so next week diffs against it.
16. Teardown: kill ONLY the PIDs this run recorded (`$QA_BACKEND_PID`, `$QA_WEB_PID`,
    `$QA_IOS_PID`) and stop the simulator boot if this was an unattended run. Never kill by port
    or by process name — that is someone else's suite as often as it is yours.

## Patterns & gotchas

- **First run is calibration, not enforcement.** If `baseline-latest.json` is absent, do NOT auto-file anything — every pre-existing design nit would look "new." Instead, write the baseline, produce the report, and surface findings to the user to triage the severity gate. Only later runs auto-file.
- **iOS Select/dropdown portals aren't drivable** via automation (the Maestro `set-player-level` flow is `.skipped`). Don't fail a journey on an interaction that's a known iOS-automation limitation — note it and move on.
- **NativeWind calc() border-radius bug**: `calc()` in mobile `tailwind.config` borderRadius silently drops to square corners. The design rubric flags this specifically — check card/button corners on iOS.
- **Never point QA at dev/E2E DBs.** QA is `levelup_qa` on port 5002. The Playwright regression run (Phase 1) spins its OWN `levelup_test`:5001 webServer — that's expected and separate.
- **iCloud/Vite watcher**: the MAIN checkout is on iCloud Drive (reports and baselines live there); the QA checkout of step 1 deliberately is not. If a web change doesn't reflect, restart Vite. Delete `… 2.ext` conflict-junk files if seen.
- **Serial iOS, parallel web.** One simulator = iOS journeys run one at a time. Web journeys fan out freely.
- **Ticket dedupe is mandatory** — without it the same bug refiles every week and the PAD backlog fills with QA noise.
