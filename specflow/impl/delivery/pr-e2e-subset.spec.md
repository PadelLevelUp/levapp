---
id: delivery.pr-e2e-subset
status: implementing
depends_on: []
serves: [P-DELIVERY-4]
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
   7a. **Seed pinned against the engine (B-442).** The E2E backend runs the scheduler, so a
   seeded future class with free places is swept by the never-filled-places scan (invitations
   rule 1c) within two minutes. A seeded class whose invitation set a spec counts (the "E2E
   Pending Confirm Class", tomorrow) carries automatic invitations off on its instance; its
   pending set is then exactly what the seed wrote, however long the run before that spec.
8. **Time.** The subset run has `--retries=0` in this job only and keeps the shared per-test
   timeout (a lower `--timeout` also bounds hooks and failed a 200-message `beforeAll`, phase 0).
   The subset step is capped at 20 minutes; a run cut by the cap says "cap hit", not "tests
   failed".
9. **Second look.** Each red spec file is re-run alone on a freshly reset database; the summary
   says "green alone: order dependency (or flake)" or "red alone too: a real failure". The check
   is red when the subset run is red.

### Acceptance Criteria

#### DELIVERY-PR-E2E-SUBSET-1: The seeded tomorrow class keeps its pending set under the scheduler (rule 7a)
- **Given** the seeded database and the E2E backend running its scheduler for ten minutes
- **When** `POST /api/app/dashboard/pending-confirmations/notify` is called as the E2E coach
- **Then** the reply says `sent: 2` — the two pending fillers of "E2E Pending Confirm Class", and no student the never-filled-places scan invited

#### DELIVERY-PR-E2E-SUBSET-2: The check runs on PRs into staging only, and is cancelled by a newer push (rule 1)
- **Given** `e2e-subset.yaml`
- **When** its triggers are read
- **Then** they are `pull_request` with branches `[staging]` and `workflow_dispatch` with `head` and `base`, there is no `push` trigger, and the concurrency group is per ref with cancel-in-progress

#### DELIVERY-PR-E2E-SUBSET-3: A changed component selects the specs holding its test ids (rule 3)
- **Given** `Engine.tsx` renders `data-testid="engine-toggle"` and `settings/engine.spec.ts` uses it
- **When** a PR changes `Engine.tsx`
- **Then** `settings/engine.spec.ts` is selected with the reason `id engine-toggle`, and a spec using other ids is not

#### DELIVERY-PR-E2E-SUBSET-4: A quarantined spec stays out unless the PR edits it (rule 4)
- **Given** `schedule-calendar/class-deletion.spec.ts` in `quarantine.txt` citing B-079 (still open)
- **When** a PR changes a component whose id that spec uses, and another PR edits the spec itself
- **Then** the first PR's subset leaves it out and lists it as quarantined; the second runs it

#### DELIVERY-PR-E2E-SUBSET-5: A fixed entry takes its spec out of quarantine (rule 4)
- **Given** B-286 resolved by PAD-514
- **When** `quarantine.txt` is read
- **Then** `messaging/nav-unread-badge.spec.ts` is not in it, and every remaining line cites a ledger entry that is not resolved

#### DELIVERY-PR-E2E-SUBSET-6: Over the cap the best-ranked are kept and it says so (rule 5)
- **Given** a change driving 30 specs
- **When** the subset is chosen with the cap at 25
- **Then** 25 specs run in file order, edited specs among them, and the summary says "truncated: 25 of 30 driven"

#### DELIVERY-PR-E2E-SUBSET-7: No driven spec is a green check that says so (rule 6)
- **Given** a PR changing a component whose ids no spec uses
- **When** the check runs
- **Then** it is green, the summary says "0 of N specs" and names that component

#### DELIVERY-PR-E2E-SUBSET-8: A red run costs its time once (rule 8)
- **Given** the workflow's subset step
- **When** its command is read
- **Then** it passes `--retries=0` and no `--timeout`, and the step has `timeout-minutes: 20`

#### DELIVERY-PR-E2E-SUBSET-9: A red is re-run alone and labelled (rule 9)
- **Given** a subset run with one red spec file
- **When** the job finishes
- **Then** that file was re-run alone after a reset, and the summary labels it order dependency or real failure

#### DELIVERY-PR-E2E-SUBSET-10: Each kind of change selects its own specs, and a broad one adds only the smoke set (rules 1, 3)
- **Given** a pull request that changes a spec, a helper, an English locale key, a file on the spec map, a module with no test ids, or a file every page uses
- **When** the specs to run are selected
- **Then** a changed spec selects itself, and a changed helper the specs that import it
- **And** a changed locale key selects the specs that quote it, and a file on the spec map the specs listed for it
- **And** a module with no ids selects through its few importers; a widely imported module, or a global file, adds the smoke set and never the whole suite
- **And** an id built from a template prefix reaches the specs that use its instances, and ids shorter than four characters are ignored
- **And** component tests and the specs under `e2e/scripts` are never selected
- **And** the smoke, quarantine and map lists are read from the workflow's own checkout, so a head that predates them is still checked
test: `frontend/apps/web/e2e/scripts/test_select_pr_specs.py` › `test_a_changed_english_key_selects_the_specs_quoting_it` (+8 more)

#### DELIVERY-PR-E2E-SUBSET-11: The subset runs on its own database, migrated and seeded before the first spec (rule 7)
- **Given** the check's job
- **When** it starts
- **Then** it has a Postgres 15 service and its own database name and ports
- **And** the database is migrated and seeded before Playwright starts
test: `frontend/apps/web/e2e/scripts/test_e2e_subset_workflow.py` › `test_the_database_is_seeded_before_playwright_starts_on_an_isolated_stack`

### Notes
- Phase 0 numbers (PR #534, run 37090127465): setup 110-150 s; green specs about 20 s each; the
  B-282 locator break was caught on PR #497, the PR that caused it; B-286 found.
- Selector tests: `frontend/apps/web/e2e/scripts/test_select_pr_specs.py` (run by the backend
  pytest lane). Workflow-shape guard: `test_e2e_subset_workflow.py` beside it.
- Not covered: backend-only changes (route-literal mapping is a possible v2), `packages/*` symbol
  tracing (v2).

### Open questions

- **P-DELIVERY-4 says the check becomes blocking "after two weeks with no false alarm"; rule 2 says only that it is the owner's decision.** No rule holds the two weeks. Recommendation: add the condition to rule 2 if it stands, or drop it from the promise.
- **The promise's "about twenty minutes" is the cap on one step.** Rule 8 caps the subset at 20 minutes; the job allows 40, and the re-run of a red adds up to 15. Recommendation: say "the subset is cut at twenty minutes".
- **The selector matches ids as plain substrings.** `engine-toggle` also selects a spec that holds only `engine-toggle-2`, and a helper is matched by its file name alone, so two helpers of the same name in different folders collide. Both select too much, never too little. Recommendation: accept, and say so in rule 3.
- **Rule 7 says "a Postgres 15 service"; the image is LevApp's own mirror.** `ghcr.io/padellevelup/ci-postgres:15` (`delivery.ci-images`). Recommendation: name the mirror.
