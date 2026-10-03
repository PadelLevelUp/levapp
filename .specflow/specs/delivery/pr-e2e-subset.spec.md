---
id: delivery.pr-e2e-subset
status: implementing
depends_on: []
implements: ../../specs-business/delivery/owner-sees-breakage-before-release.business.md
governed_by: []
---

# delivery.pr-e2e-subset

### Intent
Run, on every pull request into `staging`, the web Playwright specs the PR's changes drive, bounded
and advisory, so a broken locator or flow is seen on the PR instead of at the release gate (B-282).
Phase 0 (PR #534) built the selector and measured it on five past PRs; phase 1 (PAD-511) turns it
into the PR check.

### Entities
- **READS:** git history (base...head of the PR), `frontend/apps/web/e2e/**/*.spec.ts`, the three
  lists in `frontend/apps/web/e2e/pr-subset/`, `frontend/src/locales/en/*.json`
- **WRITES:** nothing in the product; a GitHub check, its job summary and artifacts

### Rules
1. **Trigger.** `.github/workflows/e2e-subset.yaml` runs on `pull_request` into `staging` (opened,
   synchronize, reopened) and on `workflow_dispatch` with a `head` and a `base` SHA. It does not run
   on pushes to `staging` or `main` (the release gate runs the full suite on those commits) nor on
   pull requests into `main`. A new push to the PR cancels the run in progress.
2. **Advisory.** The check is not in the `staging` ruleset's required checks; red is a warning.
   Making it required is the owner's decision (PAD-511 item 5).
3. **Selection** (`e2e/scripts/select_pr_specs.py`, git only, `base...head` where base is the merge
   base with `staging`):
   rank 0 a changed spec selects itself; rank 1 a changed web component selects every spec holding
   one of its literal test ids or template prefixes (`x-${…}` gives `x-`; ids under four characters
   are ignored); rank 2 a changed e2e helper selects its importers, and `pr-subset/spec-map.txt`
   maps a changed file to specs grep cannot see; rank 3 a changed English locale key selects the
   specs quoting it; rank 4 a changed module with no test ids and at most 3 importers selects
   through its importers' ids; rank 5 a global, broad (more than 3 importers) or
   `frontend/packages/*` change adds the smoke set (`pr-subset/smoke.txt`). Component tests
   (`*.test.tsx`) and `e2e/scripts/*.spec.ts` are never selected.
4. **Quarantine.** A spec listed in `pr-subset/quarantine.txt` is left out unless the PR edits that
   spec. Every line cites the ledger entry (and ticket, when filed) that put it there, and at least
   one cited entry is still unresolved; the line is removed in the PR that fixes that entry.
5. **Bounds.** At most 25 specs. Over that, the best-ranked 25 are kept (rank, then number of
   reasons, then path) and the check says "truncated: 25 of N driven". The full suite is never
   chosen. Specs run in file order, one worker (they share one seeded database, B-101).
6. **Empty.** No driven spec is a green check whose summary says "0 of N specs" and lists the
   changed components that drive no spec.
7. **Stack.** A Postgres 15 service, the backend venv, the database migrated and seeded BEFORE
   Playwright starts (its web servers start before `globalSetup`), `E2E_DB_NAME`,
   `E2E_BACKEND_PORT` and `E2E_WEB_PORT` all set.
8. **Time.** The subset run has `--retries=0` in this job only and keeps the shared per-test
   timeout (a lower `--timeout` also bounds hooks and failed a 200-message `beforeAll`, phase 0).
   The subset step is capped at 20 minutes; a run cut by the cap says "cap hit", not "tests
   failed".
9. **Second look.** Each red spec file is re-run alone on a freshly reset database; the summary
   says "green alone: order dependency (or flake)" or "red alone too: a real failure". The check
   is red when the subset run is red.

### Acceptance Criteria

#### The check runs on PRs into staging only, and is cancelled by a newer push (rule 1)
- **Given** `e2e-subset.yaml`
- **When** its triggers are read
- **Then** they are `pull_request` with branches `[staging]` and `workflow_dispatch` with `head` and `base`, there is no `push` trigger, and the concurrency group is per ref with cancel-in-progress

#### A changed component selects the specs holding its test ids (rule 3)
- **Given** `Engine.tsx` renders `data-testid="engine-toggle"` and `settings/engine.spec.ts` uses it
- **When** a PR changes `Engine.tsx`
- **Then** `settings/engine.spec.ts` is selected with the reason `id engine-toggle`, and a spec using other ids is not

#### A quarantined spec stays out unless the PR edits it (rule 4)
- **Given** `messaging/nav-unread-badge.spec.ts` in `quarantine.txt` citing B-286 and PAD-514
- **When** a PR changes a component whose id that spec uses, and another PR edits the spec itself
- **Then** the first PR's subset leaves it out and lists it as quarantined; the second runs it

#### Over the cap the best-ranked are kept and it says so (rule 5)
- **Given** a change driving 30 specs
- **When** the subset is chosen with the cap at 25
- **Then** 25 specs run in file order, edited specs among them, and the summary says "truncated: 25 of 30 driven"

#### No driven spec is a green check that says so (rule 6)
- **Given** a PR changing a component whose ids no spec uses
- **When** the check runs
- **Then** it is green, the summary says "0 of N specs" and names that component

#### A red run costs its time once (rule 8)
- **Given** the workflow's subset step
- **When** its command is read
- **Then** it passes `--retries=0` and no `--timeout`, and the step has `timeout-minutes: 20`

#### A red is re-run alone and labelled (rule 9)
- **Given** a subset run with one red spec file
- **When** the job finishes
- **Then** that file was re-run alone after a reset, and the summary labels it order dependency or real failure

### Notes
- Phase 0 numbers (PR #534, run 37090127465): setup 110-150 s; green specs about 20 s each; the
  B-282 locator break was caught on PR #497, the PR that caused it; B-286 found.
- Selector tests: `frontend/apps/web/e2e/scripts/test_select_pr_specs.py` (run by the backend
  pytest lane). Workflow-shape guard: `test_e2e_subset_workflow.py` beside it.
- Not covered: backend-only changes (route-literal mapping is a possible v2), `packages/*` symbol
  tracing (v2).
