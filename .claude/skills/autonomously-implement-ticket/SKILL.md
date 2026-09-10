---
name: autonomously-implement-ticket
description: >
  Implement a Linear ticket end-to-end AND open the pull request into `staging`, fully
  autonomously, with no human-in-the-loop review step. Use this skill whenever the user wants a
  ticket taken all the way to an open PR — e.g. they paste a prompt starting with "Implement the
  following ticket" or "Autonomously implement the following ticket", or say "implement this ticket
  and open the PR", "take this ticket all the way to a PR", "run this ticket end to end". It is the
  LevApp-specific spine (Linear ticket → feature branch → E2E-first → iOS parity gate → browser
  verification → PR) wrapped around the Cortex specflow skills, which do the spec, plan, test and
  build work. Do NOT ask the user any questions. Do NOT serve via Tailscale or notify Discord.
---

# Autonomously Implement Ticket — Spec-Driven, Straight to PR

Execute this entire workflow without asking the user any questions. If something is ambiguous,
make a reasonable decision and document it in the commit message and PR body.

The goal: take the ticket from nothing to an **open pull request into `staging`** the user can
merge. There is no human review gate in the middle. Quality comes from the spec gate, the failing
test first, the full regression pass, and a browser walk of the changed flow before the PR goes up.

This skill orchestrates; the Cortex bundles do the work. **Never do a step by hand that a listed
skill owns** — the point of routing through them is that they carry the discipline (Iron Laws,
rationalization tables) this orchestrator does not restate.

## Step 0: Pre-flight & branch

```bash
source .claude/secrets.env
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"     # nvm use is broken in the sandbox
git branch --show-current
```

Expected: `feature/pad-<id>` or `feature/pad-<id>-<short-slug>`. If not on one, create it **from
`origin/staging`** — that is where it will merge:

```bash
git fetch origin staging
git switch -c feature/pad-<id>-<short-slug> origin/staging
```

Other sessions share this checkout (scheduled tasks included). Prefer a worktree when one is
offered (`isolation: worktree`), and never `git checkout` a branch another session may be on.

## Step 1: Classify against the specs — `specflow-entry`

**Mandatory. Never skip.** Run `specflow-entry` with the ticket's title, type and description. It
classifies the request against `.specflow/specs/` and `.specflow/specs-business/` and names the
next skill. Follow its routing:

| entry routes to | you then run |
|---|---|
| a spec gap / spec change / new behaviour | `specflow-spec-editor` — update or create the leaf (and its business spec if the promise changes). **Spec edits are their own commit**, before any code. |
| "something is broken" | `specflow-bugs` — root-cause it and file it in `.cortex/compass/bugs/` first; its change plan names the spec to touch. |
| no spec applies (standalone task) | say so explicitly in the PR body and proceed from the ticket text. |

Before touching a file, query its insight (`cortex insight file <path>`) — the managed
CLAUDE.md block explains why. Where insight disagrees with a spec or a compass rule, the gated
layer wins.

## Step 2: Tests first — `specflow-tests`

Run `specflow-tests` for the leaf spec(s) from Step 1. For LevApp that means, concretely:

- **Backend behaviour** → a pytest case in `backend/padel_app/tests/` (fixtures in `conftest.py`;
  import services inside the test body; `with app.app_context():`; inject `now=`).
- **Web behaviour** → a Playwright spec in `frontend/apps/web/e2e/` named `"US-XXX: …"`, locators
  by role first, seeded users `e2e-coach` / `e2e-student`.
- **Mobile behaviour** → a Maestro flow in `frontend/apps/mobile/.maestro/` where the flow is
  observable (there is no mobile unit runner; a gap you cannot measure gets a note in the PR, not
  a vacuous flow).

The test MUST fail before Step 4. **Never modify an assertion to make it pass** — if the test is
wrong, the spec is wrong: go back to `specflow-spec-editor`, then fix the test.

## Step 3: Plan — `specflow-plan`

Run `specflow-plan` on the agreed spec. Its plan must name the rules and acceptance criteria being
satisfied, the files per side (backend / web / mobile / packages), and any other leaf the change
touches.

## Step 4: Build — `specflow-develop`

Run `specflow-develop` against the plan. LevApp conventions it must respect:

- Backend: services in `backend/padel_app/services/`, thin route handlers in `modules/`,
  migrations via Alembic (`flask db migrate`) — one head, always (`flask db heads`).
- Web: `@/` alias, API calls through `@levelup/api`, shadcn/ui primitives, locale strings in
  `frontend/src/locales/{pt,en}` (pt is the default locale).
- Compass rules (`.cortex/compass/rules/`) apply; the PreWrite hook warns when one matches.

## Step 4b: Port it to iOS — the parity gate

If Step 4 touched `frontend/apps/web`, build the matching `frontend/apps/mobile` screen now — same
ticket, same branch. Parity is the default; web-only is the exception.

- [ ] Screen under `apps/mobile/app/(tabs)/` + implementation in `apps/mobile/src/features/<feature>/`
- [ ] Locale namespace hand-added to `apps/mobile/src/lib/i18n.ts` (**static imports**, pt AND en — without this the screen renders raw key paths)
- [ ] Same role gating as web
- [ ] Shared logic in `packages/*` or a plain `.ts` module both shells import — shells differ in presentation only
- [ ] Verified in the simulator (curl the Metro bundle and check `originModulePath` — a stale packager silently serves another checkout)

Skipping this needs a very strong reason recorded in the PR body **and** the spec.

## Step 5: Make the new test pass

Run the test(s) from Step 2 until green. Max 5 iterations. Then typecheck — `vite build` does not:

```bash
cd frontend && npx tsc --noEmit -p apps/web/tsconfig.app.json && (cd apps/mobile && npx tsc --noEmit)
```

**Not `apps/web/tsconfig.json`** (PAD-189). That is a solution file — `"files": []` plus
project references — so `tsc --noEmit -p` on it checks **zero** files and always passes.
Verified with `--listFiles`: 0 files vs 1205 for `tsconfig.app.json`, and a deliberate
`const x: number = "str"` in `apps/web/src` goes uncaught. `tsconfig.app.json` is the app's
real source graph. The same pair of commands is the CI gate in
`.github/workflows/checks-frontend.yaml`.

## Step 6: Regression

```bash
cd backend  && source .venv/bin/activate && python -m pytest padel_app/tests/ -q
cd frontend && npm test
kill $(lsof -ti :5001) 2>/dev/null; kill $(lsof -ti :8080) 2>/dev/null; sleep 1
cd frontend/apps/web && bash e2e/scripts/reset-test-db.sh && npx playwright test
```

Before fixing a regression, understand WHY the change broke it. If it violated another leaf's
rules, resolve at the spec level first. A spec that flakes alone-vs-suite is a flake, not your
regression — re-run it in isolation before attributing it.

Because no human reviews this before it becomes a PR, the regression pass is the safety net.
**Do not open the PR with red tests** — stop and report instead.

## Step 7: Spec status & verification gate

Set the leaf's `status:` to `implemented` (and the business spec per Policy A) now that tests
pass. Then run `verification-before-completion` — it is the evidence gate for every claim in the
PR body; nothing below is written from memory.

## Step 8: Commit & push

```bash
git add -A && git commit -m "<type>(PAD-<id>): <summary>" && git push -u origin HEAD
```

`fix` for bugs, `feat` for features, `refactor` for improvements. Spec edits were committed
separately in Step 1.

## Step 9: Browser verification

The last quality gate — a green suite can still miss an obviously broken layout. Serve locally
(no Tailscale):

```bash
if ! curl -s http://localhost:5000/ >/dev/null 2>&1; then
  (cd backend && source .venv/bin/activate && source ../.claude/secrets.env && \
     nohup flask run --host 127.0.0.1 --port 5000 > /tmp/flask-ticket.log 2>&1 &) ; sleep 3
fi
if ! lsof -i :8080 >/dev/null 2>&1; then
  (cd frontend && nohup npm run dev > /tmp/vite-ticket.log 2>&1 &) ; sleep 3
fi
```

Drive `http://localhost:8080` with Claude in Chrome (load the `mcp__claude-in-chrome__*` tools via
ToolSearch first), log in, walk the flow the ticket changed. The repo lives on iCloud Drive, so
Vite HMR misses edits — restart Vite rather than trusting a stale bundle. Find a real problem →
back to Step 4, then Steps 5–6 again.

## Step 10: Open the pull request — into `staging`

`main` only accepts PRs from `staging` (ruleset + `guard-main-source`), so feature work always
targets `staging`. `/batch-merge-prs` promotes staging to main.

```bash
gh pr create --base staging --head "$(git branch --show-current)" \
  --title "PAD-<id>: <ticket title>" --body "<template below>"
```

Account `pedropacheco95` (`export GH_TOKEN=$(gh auth token --user pedropacheco95)`).

```
## Ticket
[PAD-<id>](<linear url>)

## Classification
<specflow-entry category> — `<leaf id>`; spec <changed in <commit> | unchanged>

## What changed
<2–4 lines: what and why>

## Files changed
backend / web / mobile / packages / specs — what changed in each

## Testing
- New test(s): <paths> — failed before, pass now
- Regression: backend N · unit N · tsc clean · E2E N passed
- Browser-verified locally: <the flow walked>

## iOS parity
<ported | not applicable (backend-only) | web-only because …>

## Notes
<decisions made for ambiguous parts, partial-delivery caveats the reviewer must know, or "none">
```

Print the PR URL. If the PR is a **partial** (one half of a ticket, or a fix that needs a device
build to reach users), say so in Notes — Linear auto-closes the ticket on merge and someone has to
know to reopen it.

## Step 11: Cleanup & stop

Kill only the dev servers this run started (`kill $(lsof -ti :5000)`, `:8080`), then **stop**.
The user merges the PR. No Tailscale, no Discord.

## Rules

- **NEVER ask the user questions.** Work with what you have.
- **NEVER skip `specflow-entry`.** It is the gate; "I already know which skill this is" is the
  rationalisation it exists to catch.
- **NEVER write production code before a failing test** (`specflow-tests` / `specflow-develop`
  carry this as their Iron Law).
- **NEVER modify test assertions to make them pass.**
- **Spec changes get their own commit**, before code.
- **Do NOT open the PR if tests are red.**
- **Feature PRs target `staging`, never `main`.**
- If something is genuinely impossible, document it and stop.
