# LevApp monorepo + full Cortex — migration plan

**Status: PLAN ONLY. Nothing below has been executed.** Prepared 2026-09-02 from a read of all three repos, the umbrella dir, the Cortex source (`~/Documents/Projetos/cortex`, schema 3.3) and the `berd` install as a reference. Facts were verified on disk this session; items marked **[decide]** need your answer before Phase 1 starts.

---

## 0. Why, in one paragraph

Not the GitHub bill — that is per user, not per repo, so one repo saves $0. The case is: `specs/` and `.claude/` are unversioned today (the umbrella dir is not a git repo), so the spec tree that drives every ticket has no history and can't be committed to; the "web and iOS ship together" rule spans two repos, so every full-stack ticket is two PRs that can't be reviewed or reverted as a unit; and every pipeline change is done twice (today's staging work was). The repos are not coupled by code (backend→frontend refs: 0, frontend→backend: 1), so the merge is a file move, not an untangling. Cortex wants to manage a project from its git root — which the umbrella dir currently isn't — so the monorepo is also the precondition for running full Cortex at all.

## 1. Decisions already taken this session

| # | Decision | Notes |
|---|---|---|
| D1 | Monorepo named **`levapp`**, GitHub `PadelLevelUp/levapp` | Name is free. iOS app is already "LevApp"; domain is `levapp.app`. |
| D2 | Contents: **backend + frontend (web, mobile, packages) + specs + .claude + docs**. **`levelup_issue_bot` stays its own repo.** | Bot has 30 commits, zero shared code, its own runtime, and its ticket-prompt strings are a contract with the skills. Nothing gained by absorbing it. **[decide]** confirm. |
| D3 | Release flow: **feature → PR → `staging` → PR → `main`**. No direct pushes to `staging` or `main`. `main` accepts PRs **only from `staging`** (guard workflow). | `staging` auto-deploys `staging.levapp.app`; `main` deploys prod. |
| D4 | `/batch-merge-prs` is **reworked** to integrate on a temp branch and open a PR into `staging`, instead of force-pushing `staging`. | Chosen over "leave staging pushable". |
| D5 | **Full Cortex**, profile `specflow`, replacing the old specflow skill set (`specflow-change-router`, `classify-ticket`, …). | Cortex bundles the current `specflow-*` generation. |
| D6 | Repo visibility: **public** (rulesets are free) — *pending* the old Supabase project being deleted/RLS-checked (its anon key sits in frontend git history). Alternative: private + GitHub Team ($4/user/mo). | **[decide]** — and note Phase 1 can purge that `.env` from history for free. |

Already done today (relevant context): `levapp.app` serves prod alongside `padellevelup.com`; staging pipeline PRs `levelup_backend#92` / `levelup_frontend#124` are **open and paused** — their content gets re-created inside the monorepo (Phase 4), so they will be closed, not merged.

## 2. Target layout

```
levapp/                                  ← git root. `cortex init` runs HERE and only here.
├── backend/                             ← was levelup_backend (Poetry, Flask). Paths inside unchanged.
├── frontend/                            ← was levelup_frontend. npm-workspaces root STAYS here.
│   ├── package.json  (workspaces: apps/*, packages/*)
│   ├── apps/web  apps/mobile  packages/{types,api,hooks,validation,config}
│   └── Dockerfile
├── .specflow/
│   ├── specs/                           ← 85 leaves migrated from specs/ (§6)
│   └── specs-business/                  ← NEW, authored in Phase 6
├── .cortex/                             ← Phase 5
├── .claude/                             ← skills, settings.json, settings.local.json; secrets.env gitignored
├── .github/workflows/
│   ├── deploy-backend.yaml  deploy-frontend.yaml            (main → prod)
│   ├── deploy-backend-staging.yaml  deploy-frontend-staging.yaml (staging)
│   ├── guard-main-source.yaml  repair.yaml
├── docs/                                ← INFRA_HANDOFF.md, NOTIFICATIONS_INTERNALS.md, README_NOTIFICATIONS.md,
│                                          plans/, reference/ (design sources incl. *.dc.html), qa/
├── RULES.md  build-order.md  implicit-behaviors.md  dead-features.md   ← root SpecFlow artefacts (schema §2.3)
├── CLAUDE.md                            ← project instructions + Cortex managed block
└── .gitignore
```

**Why `frontend/` keeps its own workspace root instead of lifting `apps/*` to the top:** the backend is Poetry, not npm; Metro resolves `workspaceRoot = path.resolve(__dirname, "../..")` from `apps/mobile`; the frontend Dockerfile does `COPY apps/web/package.json`, and every root script is `npm run … -w @levelup/web`. Moving the subtree wholesale keeps all of that byte-identical. The only paths that change are the ones that cross the repo boundary (§4).

**Deliberately NOT in the repo:** `hours report/`, `cross_platform_report/` (screenshots), `.new_claude/` (stale Apr-13 duplicate of `.claude/`), the `*-workspace/` skill-eval fixtures (gitignored), `.pytest_cache`, `.vscode`. **[decide]** `.loop_knowledge/` — the investigation files are decision sources; recommend ingesting them into `.cortex/archive/` (Phase 5) rather than committing raw.

## 3. Phases and gates

### Phase 0 — Land the backlog *(prerequisite; ~1–2 h)*
1. Merge the 6 open feature PRs with `/batch-merge-prs` **one last time as it is today**: backend #88, #89, #91; frontend #121, #122, #123. (Two of them, PAD-153, are a backend+frontend pair — the kind of thing the monorepo exists to make one PR.)
2. Watch both prod deploys green; `curl https://levapp.app/api/app/healthz`.
3. Close #92 and #124 as superseded (their workflow files are re-created in Phase 4 with monorepo paths).

**Gate:** both `main`s deployed and healthy; zero open PRs. Nothing in Phase 1 can start with open PRs, because history is about to be rewritten.

### Phase 1 — Build the monorepo locally, history intact *(no push; ~2 h)*
Tooling: `brew install git-filter-repo` (not installed; `git subtree` is, as the fallback).

```bash
# fresh clones, never the working checkouts
git clone git@github.com:PadelLevelUp/levelup_backend.git  /tmp/mono/backend
git clone git@github.com:PadelLevelUp/levelup_frontend.git /tmp/mono/frontend
# rewrite each history so every commit already lives under its prefix
(cd /tmp/mono/backend  && git filter-repo --to-subdirectory-filter backend)
(cd /tmp/mono/frontend && git filter-repo --to-subdirectory-filter frontend \
                          --path frontend/.env --invert-paths)      # purge the Supabase .env (D6)
# assemble
git init /tmp/mono/levapp && cd /tmp/mono/levapp
git remote add be /tmp/mono/backend  && git fetch be  && git merge --allow-unrelated-histories be/main
git remote add fe /tmp/mono/frontend && git fetch fe  && git merge --allow-unrelated-histories fe/main
# add the never-versioned umbrella content as one commit
cp -R …/levelup/specs …/levelup/.claude …/levelup/plans …  # per §2 layout
```

Result: `git log`/`git blame` work naturally under `backend/…` and `frontend/…` (paths are rewritten in history, not just at HEAD). Every SHA changes — see risk R1.

*Fallback (`git subtree add --prefix=backend`)* keeps the old SHAs but history shows the old paths and `--follow` needs care. Only take it if rewriting is vetoed.

**Gate:** `git log --oneline | wc -l` ≈ 262 + 562 + 1; `git log --follow frontend/apps/web/playwright.config.ts` reaches the original 2026 commits.

### Phase 2 — Fix the paths that cross the old repo boundary *(~2–3 h)*
Found by grep this session (77 files mention a sibling repo; most are docs/skills). The ones that execute:

| File | Change |
|---|---|
| `frontend/apps/web/playwright.config.ts:55` | `cwd: "../../../levelup_backend"` → `"../../../backend"` |
| `frontend/apps/web/e2e/scripts/reset-test-db.sh:11` | `../../../../../levelup_backend` → `../../../../../backend` |
| `frontend/apps/web/e2e/scripts/seed.py:10` (+ docstring) | same |
| `frontend/apps/mobile/scripts/e2e.sh:42` | `cd levelup_backend` → `cd backend` |
| `.github/workflows/deploy-*.yaml` | `context: backend` / `context: frontend`; **keep** image names `levelup_backend`/`levelup_frontend` and container names `padelapp`/`levelup_frontend` → **zero change on the VM** |
| `.github/workflows/*` | add a **gate job with `dorny/paths-filter`** so a backend-only push doesn't rebuild the frontend. Do **not** use workflow-level `paths:` — a required check that gets *skipped* blocks the PR forever ("skipped" ≠ "success"). |
| 14 `.claude/skills/**` (SKILL.md + `batch-merge-prs/scripts/*`) | `levelup_backend` → `backend`, etc. Most of these are also rewritten in Phase 5 anyway. |
| `.claude/settings.local.json` SessionStart hook | Now runs in a real git root, so it starts **actually working** (today `git fetch` silently fails in the non-git umbrella). See risk R6. |
| 6 `README.md`/`CLAUDE.md` + `API-CONTRACT.md` | prose path updates |
| 2 backend comments (`push_notifications.py`, `push_subscriptions.py`) | cosmetic |

Root `.gitignore` gains: `.claude/secrets.env`, `.env`, `.env.*` **not** `.env.prod/.env.staging/.env.dev` (tracked, secret-free), `**/*-workspace/`, plus the Cortex lines `cortex init` adds.

**Gate — full local suites green from the new layout:** `backend`: `python -m pytest padel_app/tests`; `frontend`: `npm test`; Playwright headless from `frontend/apps/web` on Node 24 (`export PATH=$HOME/.nvm/versions/node/v24.15.0/bin:$PATH`, run `reset-test-db.sh` first, AC power); one Maestro smoke flow. Known flaky/pre-existing failures per memory don't count.

### Phase 3 — Create the GitHub repo and cut over deploys *(~2 h, prod-touching)*
1. `gh repo create PadelLevelUp/levapp --public|--private` (D6), push `main`.
2. Copy Actions secrets (from either old repo — they are identical): `DOCKERHUB_USERNAME`, `DOCKERHUB_PASSWORD`, `GCE_HOST`, `GCE_USER`, `GCE_SSH_PRIVATE_KEY`, `POSTGRES_PW`, `FLASK_SECRET_KEY`, `MAIL_PASSWORD`, `GCS_UPLOADS_BUCKET`, `OPENROUTER_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CLAIMS_EMAIL`.
3. `workflow_dispatch` backend deploy → healthz → frontend deploy → `https://levapp.app/` 200. (Same images, same containers; this is a no-op for users if it works.)
4. Enable the Linear GitHub integration for the new repo (it links by `feature/pad-NN` branch names, so PAD tickets keep auto-linking).
5. **Archive** `levelup_backend` and `levelup_frontend` (read-only). Old PR links and old SHAs stay resolvable there — that is the answer to R1.

**Why a new repo rather than renaming `levelup_frontend` in place:** Phase 1 rewrites every frontend SHA; force-pushing that over a repo with 124 PRs orphans every commit those PRs reference. A fresh repo + archived originals is the clean audit trail. **[decide]** if you'd rather keep PR numbering continuous, the rename route is possible but messier.

**Gate:** prod healthy from the new repo's deploys; old repos archived.

### Phase 4 — Branch protection, staging pipeline, batch-merge rework *(~3 h + VM prep)*
1. Rulesets (public repo, or Team): **`main`** — require PR, required status check `guard-main-source`, block force-push and deletion. **`staging`** — require PR, block force-push. No direct pushes to either. (Free-plan private repos return `403 Upgrade to GitHub Pro` on this — D6.)
2. Re-create the staging workflows from #92/#124 with `context: backend|frontend` (containers `padelapp_staging :5100`, `levelup_frontend_staging :3100`, DB `padel_app_staging`, `--memory` caps, no VAPID/OpenRouter/GCS/mail passed). Keep `FLASK_ENV=production` in `.env.staging` — required by the PAD-95 migration guard for host `10.132.0.2`; separation is `POSTGRES_DB`.
3. **VM prep before the first staging merge** (else the container crash-loops on `flask db upgrade`): `CREATE DATABASE padel_app_staging`; nginx vhost `staging.levapp.app` → `:3100` / `/api` → `:5100`; `certbot --nginx -d staging.levapp.app`; Cloudflare A record `staging` → `34.78.247.45` DNS-only; `docker update --restart unless-stopped` on the prod containers (they have none today). These were the commands blocked by the permission classifier this session — run them yourself or approve the shape.
4. Rework `/batch-merge-prs`: integrate onto `batch/<date>` → open PR into `staging` → merge → open PR `staging → main`. Its `watch_deploy.sh` health URLs move to `levapp.app`.
5. Fast-forward `staging` to `main` (both repos' `staging` are stale ancestors of `main`, so no force needed).

**Gate:** a trivial PR into `staging` deploys `staging.levapp.app`; a PR from a feature branch straight into `main` is **rejected** by the guard; `staging → main` PR passes it.

### Phase 5 — Cortex init and knowledge migration *(~1 day, mostly curation)*
**Warning first:** the `cortex` CLI has no unknown-command guard — `cortex --version` fell through to `init` this session and scaffolded the umbrella dir (reverted). In the monorepo, run **exactly** `cortex init` at the root and nothing else until it's done. (Filed as a bug to fix in the cortex repo — see §7.)

1. `cortex init` at `levapp/` → `.cortex/` (five modules), `.specflow/` skeleton, managed `CLAUDE.md` block, hooks in `.claude/settings.json`, **git post-commit hook** (now possible), 19 skill bundles, 5 task payloads named `levapp-*` (slug = folder name). `cortex validate .` → 0/0.
2. `cortex.config.json`: `profile: "specflow"`; `insight.exclude`: `frontend/apps/mobile/ios/`, `**/node_modules/`, `**/dist/`, `.claude/`, `.specflow/`, `docs/`, `**/*.min.js`, `package-lock.json`, `*.png`. Backend has 240 `.py`, frontend 479 `.ts/.tsx` → ~720 code files, well above the 200-file auto-run threshold, so extraction **presents a scope plan for review** (Phase 6).
3. **Skills — three buckets:**
   - *Retire* (superseded by Cortex bundles, or already `off`): `specflow-change-router` → `specflow-entry`; `classify-ticket` → `specflow-entry` + `specflow-spec-editor`; `plan-implementation` → `specflow-plan`; `implement-ticket`, `decompose-feature-request`, `run-linear-ticket`, `plan-feature`, `task-learnings`, old `specflow-new-project`, old `specflow-onboard-codebase`.
   - *Rewrite:* **`autonomously-implement-ticket`** — keep its LevApp-specific spine (Linear ticket → `feature/pad-NN` → E2E-first → iOS parity gate → browser verification → PR) but have it orchestrate `specflow-entry → specflow-spec-editor → specflow-tests → specflow-plan → specflow-develop → verification-before-completion → open-pr`. `write-e2e-test` / `run-e2e-iterate` fold into `specflow-tests` (which adapts to the existing pytest/vitest/Playwright/Maestro runners — it does not force a root `tests/` tree). `batch-merge-prs` (D4).
   - *Keep, re-path:* `open-pr`, `weekly-qa`, `add-flask-feature`, `react-frontend`, `levapp-design-system`, `skill-creator`.
   - Update `.claude/CLAUDE.md`: the "Ticket workflow" and "Repos" sections describe three repos and the old router; rewrite for the monorepo and `specflow-entry`.
4. **Spec tree migration** (`specs/` → `.specflow/specs/`): today 15 files (`specs/<domain>/spec.md`, 4,878 lines) each holding several leaves as `## <domain>.<leaf>` sections with their own frontmatter — **85 leaves**: 74 `implemented`, 10 `draft`, 1 `partial` (→ `implementing`; enum has no `partial`). Mechanical split script → `.specflow/specs/<domain>/<leaf>.spec.md` (leaf directly under domain is allowed; IDs are already `<domain>.<leaf>` so `check.id-matches-path` passes). Each leaf needs `implements:` → a business spec (Phase 6). `_overview.md` in every dir (15 domains + 2 roots); the domain intro paragraphs become them. `specs/_index.md` (dependency graph, build order) → `.specflow/specs/_index.md`. Old `specs/` left with a deprecation pointer, then deleted.
5. **Root SpecFlow artefacts** from `specflow/` (Apr 2026, 301 lines): `RULES.md` (numbered project rules) → `.cortex/compass/rules/R-NNN-<slug>.md` with `governs:` globs (~15–20 rules; each needs its **Why**); `bugs.md` → `.cortex/compass/bugs/` ledger — **triage first**, most of the 2026-04 findings are fixed or stale; `build-order.md`, `dead-features.md`, `implicit-behaviors.md` → repo root (schema §2.3); `corrections.md`, `proposed-notes.md` → drop (pulse-era scratch).
6. **Archive ingestion** (`cortex-archive-ingest`): `INFRA_HANDOFF.md` (→ atlas decisions: single VM, deploy order, 1-worker ceiling), `.loop_knowledge/*investigation*.md`, `NOTIFICATIONS_INTERNALS.md`. Proposals route through the pulse gate — you accept/reject.
7. **Memory curation** — `~/.claude/projects/…/memory/` holds ~60 project facts; many are `compass/do-not-repeat` or `atlas/decisions` material. Migrate by hand-pick, not bulk copy; memory stays for cross-project/personal facts.

**Gate:** `cortex validate .` conformant; `specflow-lint` clean; a session in the repo gets the SessionStart pointer block with the `specflow-entry` line.

### Phase 6 — Insight extraction + business tree *(extraction ~1–2 h wall clock; authoring ~½ day + review)*
1. "run the initial extraction" → review the scope plan. Expected root scopes: `backend/padel_app` (services / modules / models), `frontend/apps/web`, `frontend/apps/mobile`, `frontend/packages` (**shared** scope, extracted once, `shared_by` both apps). Sonnet-class per scope.
2. `specflow-onboard-codebase` in insight-first mode to **draft `.specflow/specs-business/`** (one `<persona>-<journey>.business.md` per outcome, `implemented_by:` lists) and fill every leaf's `implements:`. Expect ~20–30 business specs across 15 domains. You review — this is gated content.
3. `specflow-lint` → 0 errors; `cortex scan && cortex constellation` for a visual sanity check.

**Gate:** every leaf has a resolving, symmetric `implements:`; `cortex insight concept eligibility` returns the files you'd expect.

### Phase 7 — Scheduled tasks *(~1 h at the keyboard, Desktop session)*
1. "run cortex-register-tasks" → 5 approval prompts → `cortex tasks verify`.
2. The **6 existing custom tasks** (`levelup-daily-change-report`, `-implement-tickets`, `-linear-report`, `-once`, `-test-health`, `-weekly-qa`) hardcode `padel_app/levelup` / `levelup_backend` paths (1–4 refs each) and are registered with the old `cwd`. Re-path, rename to `levapp-*`, re-register, delete the old registrations. Set `useWorktree: true` where a task writes code (see R7).
3. Cadences to know: Cortex daily 02:00, curation Sat 04:00, quality Sun 04:00, test-runner Sun 06:00, monthly 1st 06:00 — the Mac must be awake and **on AC power** (battery runs get mangled by Power Nap, per memory).

### Phase 8 — Cutover hygiene *(~1 h)*
Delete local worktrees (`chore/staging-pipeline` ×2, `~/levelup-appstore-wt/*` after checking), rename the local folder `levelup` → `levapp` (Cortex task names derive from it — do this **before** Phase 5, actually: fold into Phase 1), update memory index, close the old-repo tabs in your head.

## 4. Sequencing summary

```
P0 land PRs ─► P1 build mono locally (+ rename folder levapp) ─► P2 path fixes + green suites
   ─► P3 new repo + deploys + archive old ─► P4 protections + staging + batch-merge
   ─► P5 cortex init + skills + specs + rules ─► P6 extraction + business tree ─► P7 tasks ─► P8
```
P5–P7 are Cortex-only and can trail P4 by days without blocking normal ticket work; P0–P4 should be one focused block (a day) because open PRs and half-moved paths are the dangerous state.

## 5. Risk register

| # | Risk | Mitigation |
|---|---|---|
| R1 | filter-repo changes every SHA; anything citing old commits (PR bodies, Linear attachments, memory files) goes stale | Archive old repos read-only — old SHAs stay resolvable there. Never delete them. |
| R2 | iOS release path: Xcode archive from `frontend/apps/mobile`; `ios/` is gitignored + prebuild-regenerated | Relative geometry unchanged. Before the next release: `npx expo prebuild --clean` + sim build from the new path; check `EXUpdatesEnabled` per memory. |
| R3 | Required check + skipped workflow = PR blocked forever | `dorny/paths-filter` gate job that always reports; never workflow-level `paths:` on a required check. |
| R4 | Two deploy workflows on one `main` → both fire on every push (as today, just now in one repo) | paths-filter gate; keep deploys independent; per-release order still chosen by hand (memory: not always backend-first). |
| R5 | `cortex <anything-unknown>` scaffolds the cwd | Run only `cortex init` / documented commands in the repo; fix the CLI (§7). |
| R6 | The ticket SessionStart hook does `git checkout main && pull && checkout -b feature/…` and will now **work** — in a shared checkout it switches branches under concurrent scheduled sessions (a known problem per memory) | Prefer `isolation: worktree` / `useWorktree: true` for ticket sessions; or make the hook create a worktree. |
| R7 | Cortex test-runner is a code-writing loop on the same checkout | `useWorktree: true` in its registration. |
| R8 | Staging shares the VM: 204 MB RAM available, no swap | `--memory` caps already in the workflow; add a 2 GB swapfile (free) or resize to e2-small (~$13/mo) — separate decision. |
| R9 | Desktop app updates wipe the task registry | `cortex tasks verify` in the monthly review; re-run register. |
| R10 | Public repo exposes the frontend's committed `.env` history | Purged in Phase 1 (`--invert-paths`); delete/lock the Supabase project anyway. |

## 6. Effort

| Phase | Estimate |
|---|---|
| P0 | 1–2 h |
| P1–P3 | ½ day |
| P4 | 3 h + VM prep |
| P5 | 1 day (skills rewrite is the bulk) |
| P6 | ½ day authoring + your review; extraction runs unattended |
| P7–P8 | 2 h |
| **Total** | **≈ 3–4 working days**, most of it P5/P6 curation you review rather than machine time |

## 7. Side findings worth acting on regardless

- **Cortex CLI:** no unknown-command guard; `--version`/`--help`/typos fall through to `init`. Add a dispatch default that prints usage and exits 1. (Cortex repo, its own bug ledger.)
- `INFRA_HANDOFF.md` overstates one risk: `terraform.tfstate` is **not** tracked in `levelup_backend`. Host-nginx layout is now documented (memory `levapp-app-domain-and-host-nginx`).
- Prod containers have **no restart policy**; a VM reboot = outage until a redeploy.
- `padellevelup.com` has **auto-renew OFF** (expires 2027-03-06).

## 8. Open questions — answer these and Phase 0 can start

1. **D2** — issue-bot stays separate? *(recommend yes)*
2. **D6** — public repo (free rulesets) or private + Team ($4/mo)? And: delete/lock the old Supabase project before going public.
3. New repo + archive old (recommended) vs rename `levelup_frontend` in place to keep PR numbering?
4. Purge `frontend/.env` from history during the rewrite? *(recommend yes — it's free now, impossible later)*
5. Keep Docker Hub image names and VM container names as `levelup_*` for now? *(recommend yes: zero prod change; rename in a later, separate release)*
6. `.loop_knowledge/`, `plans/`, `qa/`, `reference/` → `docs/` in the repo, or ingest-only?
7. Phase 4.3 VM prep — you run it, or approve the command shape for me?
8. When: are the 6 open PRs ready to merge now (P0), or does this wait?
