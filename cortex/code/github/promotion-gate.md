---
about: "The staging-to-main promotion gate: pre-read PRs, pre-walk migrations on a prod-shaped copy, audit App Store builds, merge with the matched head"
permanence: changing
verified: "2026-11-20 (observed)"
origin:
  - session:1f2b6f85-3591-4547-8797-325a278a29e9
need:
  - .github/workflows/deploy-prod.yaml
  - backend/padel_app/utils/client_capabilities.py
  - backend/padel_app/tests/test_pad362_evaluation_contract.py
  - backend/padel_app/tests/test_pad363_legacy_freeze.py
---

# The promotion gate (staging → main)

A promotion is one PR from `staging` into `main` (`world/decisions/staging-gated-release-flow.md`), and `main` deploys
production. Real users run App Store builds that never change, so every promotion is first a compatibility question for
them, then a migration question, then a deploy to watch. This is the method that held on 2026-11-15 and twice on
2026-11-20 (the second promotion of that day went from merge to prod in seven minutes because everything below had been
done from the PR heads before the merge).

## Before the merge

1. **Pin the shas.** `main`'s head, `staging`'s head at the go, and every PR still to land, by full sha. `origin/staging` is
   shared across worktrees and moves when any session fetches; re-diff each later head against the pinned one instead of
   re-running the gate.
2. **Read each PR from its own head** with the same checklist: merges and files by area; backend non-test files; migrations
   added; route decorators removed or added (`git diff … -- backend/padel_app/modules | grep -E '^[-+]\s*@.*\.route\('`);
   response keys deleted per file (a global sweep misses a key dropped from one response and used elsewhere);
   `client_capabilities.py` and the shells' declarations; the two frozen evaluation pins, which may differ only in
   `@pytest.mark.criterion` lines; models changed without a migration.
3. **Audit the live App Store builds** against the new server: which build is which commit (pin by upload time, not by the
   "release" commit), which endpoints each bundle calls, which capability tokens it declares
   (`code/mobile/proving-a-js-fix-is-in-the-ipa.md`), and whether any changed handler or side-effect chain reaches an old
   build. A member can do the reading; the lead re-reads the cheap invariants above before trusting a PASS. A PR that
   grows after its audit is re-audited: compare its head at audit time with its head at merge time.
4. **Pre-walk every new migration** from a detached worktree at the PR head, on a scratch Postgres restored from the newest
   prod dump: `upgrade` with per-step timing, `heads` (one), `flask db check` ("No new upgrade operations detected"),
   `downgrade` to the previous head, `upgrade` again, `check` again; then park the scratch DB at staging's head so the next
   walk is incremental. Set `POSTGRES_PORT` explicitly (an unset port resolved to a per-checkout E2E port and failed
   "database does not exist" while psql saw the DB) and print the imported package path first: a venv from another checkout
   imports that checkout's code.
5. **Prove the merge tree equals the pre-walked head** once the PR is merged into staging: `git diff --stat <pr head>
   <merge commit> -- backend` empty, and the changed-file list equal to the PRs' own. Then the pre-walk is the walk; a
   mobile-only PR keeps the backend tree identical.
6. **Probe the capabilities header through the edge**, no account needed: a junk-credential `POST /api/auth/login` with body
   `{"username": …, "password": …}` must give the app's own 401 both with and without `X-LevApp-Capabilities`. Pass `-H '…'`
   literally; a header built by shell expansion word-splits, curl sends a broken Content-Type and the edge answers 415,
   which is the probe's fault, not the edge's. An `email` body gives 400 both ways and is not comparable.

## The merge and after

- Ask the orchestrator to hold other merges into `staging` while the promotion PR is open, and merge with
  `gh pr merge <n> --merge --match-head-commit <full 40-character sha>`: GitHub refuses a short sha, and the match turns a
  moved `staging` into a refusal instead of a surprise promotion. Report the gate result upward before merging.
- The PR's checks take about 45 to 50 minutes (the Postgres pytest lanes); merge to prod live is 6 to 7 minutes.
- The production `flask db upgrade` line is in the **Deploy prod** job's log (`[migrate] running flask db upgrade` …
  `Running upgrade <old> -> <new>`). The drift-gate job earlier in the same workflow migrates an empty database; its lines
  prove nothing about prod.
- Read-only smoke on prod: `healthz`, the web root, the junk login with and without the header (401 both), an
  unauthenticated dashboard read (401), and a `POST` to a route the new build needs (401 means present, 404 means missing;
  the device-token route is `/api/notifications/device`).
- The evidence lives in a local handoff doc, one table per head, verdict last; the facts that outlive the machine come here.

Filing: the staging-to-main promotion gate as a method → code/github/promotion-gate.md (origin: session:1f2b6f85-3591-4547-8797-325a278a29e9)
