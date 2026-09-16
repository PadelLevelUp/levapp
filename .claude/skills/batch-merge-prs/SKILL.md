---
name: batch-merge-prs
description: Land every open pull request into `staging` at once by integrating them all onto a batch branch, proving the combined result passes the full local test suite, opening ONE pull request into `staging` (which deploys staging.levapp.app), and then promoting `staging` to `main` with a second pull request — so prod deploys once per release. Runs start to finish without asking anything; it only stops if the batch cannot be made green. Use this whenever the user has open PRs to land and says anything like "merge all the open PRs", "batch merge these", "land these PRs together", "clear the PR backlog", "do a release", "merge PAD-89 and PAD-90 together", or "promote staging to main". Also use it when they ask to merge a subset of open PRs as one batch, or to watch the deploy pipeline until it's green after landing. Prefer this over merging PRs one at a time whenever more than one PR is in play.
---

# Batch-merge open PRs via staging

## What this does

Integrate every open PR (into `staging`) onto one batch branch, prove the *combination*
still works, land it on `staging` through a PR, verify `staging.levapp.app`, then promote
`staging` to `main` through a second PR and verify `levapp.app`. One staging deploy, one
prod deploy, however many PRs.

**Branch rules you are working under.** `main` and `staging` are ruleset-protected:
no direct pushes, no force-pushes, PR required. `main` additionally requires the
`guard-main-source` check, which fails any PR whose head is not `staging`. So the batch
never pushes `staging` or `main` itself — it pushes a *batch branch* and merges PRs.

## How to behave

Run the whole thing without checking in. An open PR has already been reviewed and
tested — your job is not to re-evaluate whether it should ship, rank its risk, or
surface it for a decision. Merge it. The value you add is in the combination: PRs that
were each fine alone can conflict, collide on Alembic heads, or break each other's
tests, and none of that is visible until they are on one branch.

**Stop and ask only when the batch cannot be made green.** That means: a conflict that
needs a decision rather than a combination, or a test failure you cannot attribute and
fix. Nothing else is worth interrupting for. Don't ask permission before promoting to
main, don't present a plan for approval, don't list "decisions needed."

Two exceptions, both mechanical rather than advisory: skip **draft** PRs (the author
flagged them as not ready) and honour an explicit subset if the user named one. Say
what you skipped in the closing summary, don't ask about it.

If the user explicitly asks for a plan first — "dry run", "what would you do", "don't
merge yet" — then stop after Step 5 and show them the batch, conflicts, and test
results. That is the exception, not the default.

## Step 1 — Preflight

```bash
export GH_TOKEN=$(gh auth token --user pedropacheco95)
source /Users/pedropacheco1/Documents/Projetos/padel_app/levapp/.claude/secrets.env
export PATH="$HOME/.nvm/versions/node/v24.15.0/bin:$PATH"   # nvm use is broken in the sandbox
```

Use `GH_TOKEN`, not `gh auth switch` — the latter mutates global config and concurrent
sessions on this repo have been observed flipping it back mid-run. Bash calls don't
share shell state, so re-export it in any call that uses `gh`.

Then build ONE isolated worktree on a batch branch cut from `origin/staging`:

```bash
REPO=/Users/pedropacheco1/Documents/Projetos/padel_app/levapp
BATCH=~/levapp-batch-wt
cd "$REPO" && git fetch origin && git worktree add "$BATCH" -B "batch/$(date +%Y%m%d-%H%M)" origin/staging
ln -sfn "$REPO/backend/.venv" "$BATCH/backend/.venv"
cd "$BATCH/frontend" && npm install --no-audit --no-fund
```

The monorepo makes the old "sibling worktrees with load-bearing names" trick
unnecessary: `frontend/apps/web/playwright.config.ts` boots Flask from `../../../backend`
inside the same worktree, so the E2E suite tests the batched frontend against the
batched backend by construction.

Work in a worktree rather than the live repo because it sits on iCloud Drive, is
frequently dirty, and other sessions move branches underneath you. The backend `.venv`
is a symlink (the live repo's is itself a symlink into the old `levelup_backend`
checkout; both resolve); the frontend needs a real `npm install` because symlinking
`node_modules` does not work in this workspace.

## Step 2 — Enumerate

```bash
python3 <skill>/scripts/list_batch.py            # all open PRs into staging
python3 <skill>/scripts/list_batch.py --only PAD-89,PAD-90   # a named subset
```

The script lists PRs whose **base is `staging`** (PRs into `main` are promotions, never
batch inputs), groups them by Linear ticket, and orders them: smallest first,
migration-touching last and consecutively, so Alembic heads get reconciled once at the
end rather than after every merge.

Confirm each PR is genuinely unmerged with `git merge-base --is-ancestor origin/<branch>
origin/staging` rather than trusting PR state.

## Step 3 — Forecast conflicts

```bash
bash <skill>/scripts/forecast_conflicts.sh "$BATCH" origin/staging <branches...>
```

Do this before integrating so you know what you're walking into. GitHub's
`mergeable: CLEAN` is computed pairwise against the base and says nothing about
PR-vs-PR; every PR in a batch can report CLEAN and still collide. The script does real
in-memory 3-way merges — pairwise to find which tickets fight, then cumulative to catch
files that only conflict once three or four PRs have piled into them. It creates no
commits and moves no refs.

## Step 4 — Integrate

Merge each PR branch into the batch branch, in the script's order:

```bash
git merge --no-ff origin/<branch> -m "Merge branch '<branch>' into staging"
```

`--no-ff` keeps each ticket a distinct revertable commit, which is what lets you drop
one ticket later without unpicking the rest — and it is what makes GitHub flip each PR
to **MERGED** on its own once the batch lands (the PR's head commit becomes an ancestor
of `staging`).

**Conflicts:** resolve them yourself when the two sides are independently correct and
the merge is a matter of combining them — lockfiles, migration chains, translation
catalogues, import lists, two PRs each appending a test. Read
`references/conflict-playbook.md` for the resolutions that recur here.

Stop and ask only when the two changes genuinely disagree about what the code should do
— competing rewrites of the same function body, one PR adding a validation another
removes. Guessing there produces code that compiles, passes tests, and behaves wrongly,
which nothing downstream will catch. When you ask, show both versions, say what each PR
was trying to achieve, and recommend one.

**The conflicts git reports are not the dangerous ones.** A conflict marker means git
knew it couldn't decide. The batch-specific failure mode is the opposite: two edits to
*different* lines of the same function that git combines cleanly into code that is
wrong or doesn't compile. A real instance from this repo — one PR extracted a handler
into its own function, another added `await` inside that handler's body; merged, the
`await` landed in a function that was never marked `async`. No conflict, no failing
test, and it would have shipped.

So after every conflict you resolve, and once at the end of integration, typecheck the
result — `vite build` does **not** typecheck:

```bash
cd "$BATCH/frontend" && npx tsc --noEmit -p apps/web/tsconfig.app.json && (cd apps/mobile && npx tsc --noEmit)
cd "$BATCH/backend"  && .venv/bin/python -c "import padel_app"
```

**`tsconfig.app.json`, not `tsconfig.json`** (PAD-189): `apps/web/tsconfig.json` is a solution
file (`"files": []` + project references), so `tsc -p` on it checks zero files and always
passes — the exact silent-green failure this step exists to prevent.

Then handle the two things a batch reliably breaks:

**Alembic heads.** `cd "$BATCH/backend" && FLASK_APP=padel_app .venv/bin/python -m flask db heads`.
Parallel PRs branch their migrations off the same parent, so a batch routinely produces
two heads; `flask db upgrade` in the deploy entrypoint takes a singular head and aborts,
the container Exits(1), and nginx 502s every `/api/*` call while the frontend still
serves fine — so it presents as "nobody can log in". That was the 2026-07-06 outage.
Fix it in the batch: add a no-op revision whose `down_revision` is a tuple of every
head, then re-run until there is exactly one.

Also read what the migrations *do*, not just how many there are. A data backfill with a
no-op `downgrade()` is irreversible in prod. If the batch contains one, take a snapshot
before promoting to main — `backend/scripts/backup.sh` on the VM has `BUCKET=""`, so the
nightly offsite backup is probably not running, and there may be nothing to restore from.

**Lockfiles.** If any PR touched `backend/pyproject.toml` or a `package.json`,
regenerate rather than trusting a merged lock — CI fails the deploy at
`poetry check --lock` / `npm ci` before the app ever builds:

```bash
cd "$BATCH/backend"  && poetry lock && poetry check --lock
cd "$BATCH/frontend" && rm -rf node_modules package-lock.json && npm install && npm ci --dry-run
```

Confirm `npm ci --dry-run` prints no `Missing:` or `Invalid:` lines. These are npm and
Poetry repos; a stray `pnpm-lock.yaml` breaks the deploy.

## Step 5 — Prove the combination works

Neither branch runs tests in CI — `deploy-staging.yaml` and `deploy-prod.yaml` build and
ship, nothing more — so the local suite is the only gate that exists before a deploy.

```bash
cd "$BATCH/backend"  && source .venv/bin/activate && python -m pytest padel_app/tests/ -q
cd "$BATCH/frontend" && npm run build && npm test

kill $(lsof -ti :5001) 2>/dev/null; kill $(lsof -ti :8080) 2>/dev/null; sleep 1
cd "$BATCH/frontend/apps/web"
bash e2e/scripts/reset-test-db.sh
npx playwright test
```

Details that each cost someone an hour:

- Run Playwright from `frontend/apps/web`, not the workspace root — from the root the
  webServer and globalSetup are skipped, `baseURL` is unset, and every test dies with
  "Cannot navigate to invalid URL".
- Kill 5001 and 8080 **separately**; macOS `lsof` doesn't accept the combined form. A
  surviving dev server on 8080 gets reused and proxies to port 5000 (dev DB), so logins
  fail against the test DB.
- Run `reset-test-db.sh` first. Playwright starts Flask *before* globalSetup, so a stale
  `levelup_test` schema crashes APScheduler and the webServer never comes up.
- Never `--headed` or `--ui` unless asked. Machine must be on AC power for an unattended
  run (Power Nap mangles battery runs).

Some specs in this suite are historically flaky rather than broken — they pass alone and
fail under full-suite load. Before treating any failure as a batch regression, re-run
that spec in isolation against a fresh test DB. If it passes there, check whether the
batch actually touched the code path (`git diff --name-only origin/staging..HEAD`); if it
didn't, the failure is a flake, not your problem to attribute.

Fixing the flake properly is usually cheap and worth doing. The recurring cause here is
a fixed `waitForTimeout` racing an auto-save; replacing it with `page.waitForResponse`
on the actual request is deterministic. Arm the wait *before* the click that triggers it.

For anything else that fails, fix it if the fix is small and clearly correct. If you can
attribute the failure to one ticket and the fix isn't obvious, revert that ticket's
merge commit, re-run, and note it in the summary. Reverting one ticket beats a
speculative fix, and the rest of the batch still lands.

If the batch still won't go green, that is the one situation worth stopping for. Report
what fails, what you tried, and which ticket you believe is responsible.

## Step 6 — Land on staging

Green batch means land. Don't ask.

```bash
cd "$BATCH" && git push -u origin "$(git branch --show-current)"
gh pr create --base staging --head "$(git branch --show-current)" \
  --title "Batch: N tickets (PAD-a…PAD-b)" --body "<one line per ticket + test summary>"
gh pr merge --merge --delete-branch          # merge commit, never squash/rebase (see Step 8)
SHA=$(git rev-parse origin/staging)   # after: git fetch origin
bash <skill>/scripts/watch_deploy.sh staging "$SHA"
```

`watch_deploy.sh staging` polls `deploy-staging.yaml` for that commit and then probes
`https://staging.levapp.app` (API healthz + web root). A green run is necessary, not
sufficient — the deploy's last step is `docker run -d`, which succeeds the instant the
container is created; the health probe is what proves it stayed up.

## Step 7 — Promote staging to main

```bash
gh pr create --base main --head staging --title "Release: N tickets (PAD-a…PAD-b)" --body "..."
gh pr checks --watch                         # guard-main-source must pass (it will: head is staging)
gh pr merge --merge
git fetch origin && SHA=$(git rev-parse origin/main)
bash <skill>/scripts/watch_deploy.sh prod "$SHA"
```

**Deploy ordering is inside the workflow now.** `deploy-prod.yaml` runs `backend` then
`frontend` for one commit, so the common case — additive backend work — is safe by
construction. If a release contains a backend contract change that the *deployed*
frontend violates (the PAD-89 season-ids case), the frontend must go first: dispatch
`deploy-prod.yaml` by hand twice — `gh workflow run deploy-prod.yaml -f target=frontend`,
watch it, then `-f target=backend`. State the order you chose in one line in the summary.

## Step 8 — Close out

The feature PRs flip to **MERGED** on their own: Step 4 integrated each with
`--no-ff`, Step 6 landed the batch with a merge commit, so every PR head is a genuine
ancestor of `staging`. Verify rather than assume:

```bash
gh pr view <n> --json state --jq .state
```

If a PR reads CLOSED instead, the batch was squashed or rebased somewhere — comment the
merge SHA on it and close it manually. Never squash the batch PR or the promotion PR.

Linear closes tickets when their PR merges. If a PR was a **partial** (one half of a
ticket, or a fix that needs a device build to reach users), reopen the ticket with a
comment saying what is still outstanding — the author's PR body says so when it is.

Then clean up:

```bash
cd "$REPO" && git worktree remove --force "$BATCH"
```

Then report, briefly and after the fact — this is a record, not a request:

```
Released N tickets (M PRs). Staging <sha> → main <sha>. Staging and prod deploys green, both healthy.
Conflicts resolved: 3 (poetry.lock regenerated; AddClassSheet.tsx combined; seed.py merged)
Alembic: 2 heads → merge revision <rev>
Tests: backend 797 passed · frontend 127 passed · tsc clean · E2E 315 passed (1 skipped)
Skipped: PAD-XX (draft)
Reverted: PAD-YY — broke <spec>, still open
Linear: PAD-ZZ reopened (partial)
```

## Reference

- `references/conflict-playbook.md` — recurring conflict resolutions and where the line
  sits between combining and deciding. Read it on the first conflict.
- `scripts/list_batch.py` — enumerate PRs into staging and group them by ticket.
- `scripts/forecast_conflicts.sh` — pairwise + cumulative conflict forecast, no commits.
- `scripts/watch_deploy.sh <prod|staging> <sha>` — poll the deploy by commit, then health-probe.
