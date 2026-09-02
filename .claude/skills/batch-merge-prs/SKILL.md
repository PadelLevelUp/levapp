---
name: batch-merge-prs
description: Land every open pull request at once by integrating them all onto a shared `staging` branch, resolving conflicts, verifying the combined result passes the full local test suite, and then merging staging into main a single time per repo — so prod deploys twice instead of once per PR. Runs start to finish without asking anything; it only stops if staging cannot be made green. Use this whenever the user has open PRs to land and says anything like "merge all the open PRs", "batch merge these", "merge everything to staging then main", "land these PRs together", "clear the PR backlog", "do a release", "merge PAD-89 and PAD-90 together", or "I don't want 12 separate deploys". Also use it when they ask to merge a subset of open PRs as one batch, or to watch the deploy pipeline until it's green after landing. Prefer this over merging PRs one at a time whenever more than one PR is in play.
---

# Batch-merge open PRs via staging

## What this does

Integrate every open PR onto `staging`, prove the *combination* still works, merge to
`main` once per repo, watch the deploy, close the PRs. Two deploys instead of twenty.

## How to behave

Run the whole thing without checking in. An open PR has already been reviewed and
tested — your job is not to re-evaluate whether it should ship, rank its risk, or
surface it for a decision. Merge it. The value you add is in the combination: PRs that
were each fine alone can conflict, collide on Alembic heads, or break each other's
tests, and none of that is visible until they are on one branch.

**Stop and ask only when staging cannot be made green.** That means: a conflict that
needs a decision rather than a combination, or a test failure you cannot attribute and
fix. Nothing else is worth interrupting for. Don't ask permission before merging to
main, don't present a plan for approval, don't list "decisions needed."

Two exceptions, both mechanical rather than advisory: skip **draft** PRs (the author
flagged them as not ready) and honour an explicit subset if the user named one. Say
what you skipped in the closing summary, don't ask about it.

If the user explicitly asks for a plan first — "dry run", "what would you do", "don't
merge yet" — then stop after Step 4 and show them the batch, conflicts, and test
results. That is the exception, not the default.

## Step 1 — Preflight

```bash
export GH_TOKEN=$(gh auth token --user pedropacheco95)
source /Users/pedropacheco1/Documents/Projetos/padel_app/levelup/.claude/secrets.env
```

Use `GH_TOKEN`, not `gh auth switch`. The globally-active account is often
`pedropacheco-berd`, which cannot see the private `levelup_frontend` repo at all — and
the error it produces ("Could not resolve to a Repository") reads like the repo was
renamed rather than an auth failure. `gh auth switch` mutates global config and
concurrent sessions on this repo have been observed flipping it back mid-run;
`GH_TOKEN` is scoped to your shell and immune. Bash calls don't share shell state, so
re-export it in any call that uses `gh`.

Then build isolated worktrees:

```bash
BATCH=~/levelup-batch-wt && mkdir -p "$BATCH"
cd <levelup_backend>  && git fetch origin && git worktree add "$BATCH/levelup_backend"  -B staging origin/main
cd <levelup_frontend> && git fetch origin && git worktree add "$BATCH/levelup_frontend" -B staging origin/main
ln -s <levelup_backend>/.venv "$BATCH/levelup_backend/.venv"
cd "$BATCH/levelup_frontend" && npm install
```

**The directory names are load-bearing.** `apps/web/playwright.config.ts` boots Flask
with `cwd: ../../../levelup_backend`, relative to the frontend checkout. Naming the
worktrees `levelup_frontend` and `levelup_backend` as siblings is the entire mechanism
by which the E2E suite tests batched frontend against batched backend. Get the names
wrong and you will silently test new frontend against whatever is checked out in the
live repo.

Work in worktrees rather than the live repos because those sit on iCloud Drive, are
frequently dirty, and other sessions move their branches underneath you. The backend
needs the symlinked `.venv` because the Playwright config runs `source .venv/bin/activate`
in that directory; the frontend needs a real `npm install` because symlinking
`node_modules` does not work in this monorepo.

`-B staging origin/main` resets staging every time. Never reuse it: `origin/staging`
already exists in both repos (plus `batch-staging` and `local_staging` in the frontend)
with unknown history, and reusing it rides abandoned work into main.

## Step 2 — Enumerate

```bash
python3 <skill>/scripts/list_batch.py            # all open PRs, both repos
python3 <skill>/scripts/list_batch.py --only PAD-89,PAD-90   # a named subset
```

The script groups PRs by Linear ticket across both repos and orders them: smallest
first, migration-touching last and consecutively, so Alembic heads get reconciled once
at the end rather than after every merge.

When merging everything, cross-repo tickets take care of themselves. They only matter
for a **subset**: PAD-75, 78, 89, 90, 92 and 101 each have halves in both repos, and
landing one half alone can break prod — PAD-89's backend makes `upsert_seasons` a pure
upsert that rejects seasons without ids, while the deployed frontend doesn't send them,
so every "Save seasons" click 400s. If the user names a subset, pull in the other half
automatically and mention it in the summary. The exception is a half that is
**test-only** — several frontend halves contain no app code, and those can be left out
without breaking anything.

Confirm each PR is genuinely unmerged with `git merge-base --is-ancestor <branch>
origin/main` rather than trusting PR state. This repo pair batch-merges, so already-landed
branches sit in GitHub as `CLOSED`, never `MERGED`, and PR status lies.

## Step 3 — Forecast conflicts

```bash
bash <skill>/scripts/forecast_conflicts.sh "$BATCH/levelup_backend" origin/main <branches...>
```

Do this before integrating so you know what you're walking into. GitHub's
`mergeable: CLEAN` is computed pairwise against `main` and says nothing about PR-vs-PR;
every PR in a batch can report CLEAN and still collide. The script does real in-memory
3-way merges — pairwise to find which tickets fight, then cumulative to catch files
that only conflict once three or four PRs have piled into them. It creates no commits
and moves no refs.

## Step 4 — Integrate

Merge each PR branch into its repo's staging, in the script's order, matching the
convention already in your history:

```bash
git merge --no-ff origin/<branch> -m "Merge branch '<branch>' into staging"
```

`--no-ff` keeps each ticket a distinct revertable commit, which is what lets you drop
one ticket later without unpicking the rest.

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

So after every conflict you resolve, and once at the end of integration, run a
typecheck/build over the result (`npm run build`, or `npx tsc --noEmit -p apps/web/tsconfig.json`
for a faster loop). It is seconds of work and it is the only thing that catches this
class. Treat a clean merge of two PRs that touched the same function as unverified until
the compiler agrees.

Then handle the two things a batch reliably breaks:

**Alembic heads.** `FLASK_APP=padel_app flask db heads` in the backend worktree. Parallel
PRs branch their migrations off the same parent, so a batch routinely produces two
heads; `flask db upgrade` in the deploy entrypoint takes a singular head and aborts,
`padelapp` Exits(1), and nginx 502s every `/api/*` call while the frontend still serves
fine — so it presents as "nobody can log in". That was the 2026-07-06 outage. Fix it in
the batch: add a no-op revision whose `down_revision` is a tuple of every head, then
re-run until there is exactly one.

Also read what the migrations *do*, not just how many there are. A data backfill with a
no-op `downgrade()` is irreversible in prod. If the batch contains one, take a snapshot
before merging to main — `scripts/backup.sh` on the VM has `BUCKET=""`, so the nightly
offsite backup is probably not running, and there may be nothing to restore from.

**Lockfiles.** If any PR touched `pyproject.toml` or `package.json`, regenerate rather
than trusting a merged lock — CI fails the deploy at `poetry check --lock` / `npm ci`
before the app ever builds, so a stale lock means nothing ships.

```bash
cd "$BATCH/levelup_backend"  && poetry lock && poetry check --lock
cd "$BATCH/levelup_frontend" && rm -rf node_modules package-lock.json && npm install && npm ci --dry-run
```

`npm install --package-lock-only` is unreliable in this monorepo — it can add a
top-level dep without its transitive tree and `npm ci` still fails in Docker. Use node
20 or 22 via nvm to match the Docker build, and confirm `npm ci --dry-run` prints no
`Missing:` or `Invalid:` lines. Ignore any global pnpm preference; these repos are npm
and Poetry, and a stray `pnpm-lock.yaml` breaks the deploy.

## Step 5 — Prove the combination works

This is the gate the whole workflow exists for. Neither repo runs CI on PRs or on
`staging` — both have only `deploy.yaml` on `push: [main]` — so pushing staging tests
nothing and there is no check run to wait for. The local suite is the only gate that
exists before prod.

```bash
cd "$BATCH/levelup_backend" && source .venv/bin/activate && python -m pytest padel_app/tests/ -q
cd "$BATCH/levelup_frontend" && npm run build && npm test

kill $(lsof -ti :5001) 2>/dev/null; kill $(lsof -ti :8080) 2>/dev/null; sleep 1
cd "$BATCH/levelup_frontend/apps/web"
nvm use 24.15.0
bash e2e/scripts/reset-test-db.sh
npx playwright test
```

Details that each cost someone an hour:

- Run Playwright from `apps/web`, not the frontend root — from the root the webServer
  and globalSetup are skipped, `baseURL` is unset, and every test dies with "Cannot
  navigate to invalid URL".
- Kill 5001 and 8080 **separately**; macOS `lsof` doesn't accept the combined form. A
  surviving dev server on 8080 gets reused and proxies to port 5000 (dev DB), so logins
  fail against the test DB.
- Run `reset-test-db.sh` first. Playwright starts Flask *before* globalSetup, so a stale
  `levelup_test` schema crashes APScheduler and the webServer never comes up.
- Never `--headed` or `--ui` unless asked.

Some specs in this suite are historically flaky rather than broken — they pass alone and
fail under full-suite load. Before treating any failure as a batch regression, re-run
that spec in isolation against a fresh test DB. If it passes there, check whether the
batch actually touched the code path (`git diff --name-only origin/main..HEAD`); if it
didn't, the failure is a flake, not your problem to attribute.

Fixing the flake properly is usually cheap and worth doing, because it stops the same
false alarm consuming the next release too. The recurring cause here is a fixed
`waitForTimeout` racing an auto-save; replacing it with `page.waitForResponse` on the
actual request is deterministic. Arm the wait *before* the click that triggers it —
`waitForResponse` only observes traffic that happens after the call.

For anything else that fails, fix it if the fix is small and clearly correct — a batch
often breaks a test in a mechanical way, like two PRs both seeding the shared E2E
database. If you can attribute the failure to one ticket and the fix isn't obvious,
revert that ticket's merge commit (both halves if cross-repo), re-run, and note it in
the summary. Reverting one ticket beats a speculative fix, and the rest of the batch
still lands.

If staging still won't go green, that is the one situation worth stopping for. Report
what fails, what you tried, and which ticket you believe is responsible.

## Step 6 — Merge to main

Green staging means merge. Don't ask.

```bash
git checkout main && git pull --ff-only origin main
git merge --no-ff staging -m "Release: N tickets (PAD-a…PAD-b)"
git push origin main
```

Both repos deploy separately, and there is a window of a few minutes where one is new
and the other is old. **Merge whichever side is backward-compatible with the other's
old version first**, and decide this per batch rather than by rote:

- Additive backend work — new endpoints, new fields — is compatible with the old
  frontend, so backend goes first. This is the common case.
- A backend change that alters an existing contract in a way the deployed frontend
  violates must go **second**. PAD-89 is the worked example: its backend rejects
  seasons without ids and the shipped frontend omits them, so backend-first would 400
  every season save until the frontend caught up.

Check the batch for contract changes, pick the order, state it in one line in the
summary. Neither `main` is branch-protected, so a direct push is correct and no PR is
needed for the batch itself.

## Step 7 — Wait for the deploy and prove prod is up

```bash
bash <skill>/scripts/watch_deploy.sh PadelLevelUp/levelup_backend  "$SHA"
# then the other repo, only once the first exits 0
```

The script polls until the run for **that specific commit** completes, then probes
`https://padellevelup.com/api/app/healthz` and the frontend root.

Both halves matter. Selecting by commit rather than recency matters because both
workflows use `concurrency: cancel-in-progress: false`, so deploys queue and "latest run
on main" can be somebody else's. Probing after green matters because the deploy's final
step is `docker run -d` over SSH, which reports success the moment the container is
created — the container can Exit(1) seconds later on a failed `flask db upgrade` while
the workflow still shows green and every `/api/*` returns 502. A green workflow is
necessary, not sufficient.

Exit 3 means green-but-unhealthy; the script prints the diagnosis path. The usual cause
is a missed Alembic head, fixed by pushing a merge revision.

## Step 8 — Close out

Check the PR states before doing anything to them:

```bash
gh pr view <n> --repo <repo> --json state --jq .state
```

Because Step 4 integrates with `git merge --no-ff origin/<branch>`, each PR's head
commit ends up a genuine ancestor of `main`, and GitHub detects that and marks the PR
**MERGED** on its own — no comment or manual close needed. Trying to close one then
fails with "can't be closed because it was already merged", which is a success, not an
error.

This is worth knowing because the folklore says otherwise: batch-landed PRs are supposed
to get stranded in `CLOSED`, breaking the Linear report's merged-PR reconciliation. That
happens when the branch is *squashed or rebased* onto main, so the original head commit
never appears in its history. Preserving the branch commits — which `--no-ff` does — is
what avoids it. If you ever land a batch some other way, fall back to commenting the
merge SHA on each PR and closing it manually.

Then clean up:

```bash
git worktree remove --force "$BATCH/levelup_backend"
git worktree remove --force "$BATCH/levelup_frontend"
```

Then report, briefly and after the fact — this is a record, not a request:

```
Released N tickets (M PRs). Backend <sha>, frontend <sha>. Both deploys green, prod healthy.
Conflicts resolved: 3 (poetry.lock regenerated; AddClassSheet.tsx combined; seed.py merged)
Alembic: 2 heads → merge revision <rev>
Tests: backend 214 passed · frontend 38 passed · E2E 61 passed (3 known pre-existing failures)
Skipped: PAD-XX (draft)
Reverted: PAD-YY — broke <spec>, still open
```

## Reference

- `references/conflict-playbook.md` — recurring conflict resolutions and where the line
  sits between combining and deciding. Read it on the first conflict.
- `scripts/list_batch.py` — enumerate and group PRs by ticket across both repos.
- `scripts/forecast_conflicts.sh` — pairwise + cumulative conflict forecast, no commits.
- `scripts/watch_deploy.sh` — poll the deploy by commit SHA, then health-probe prod.
