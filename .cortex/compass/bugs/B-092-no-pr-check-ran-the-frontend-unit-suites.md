---
id: B-092
title: "No PR check ran the frontend unit suites, so vitest-based guards only failed on the assembled batch"
type: incomplete-rule
severity: medium
status: resolved
affects:
  - .github/workflows/checks-frontend.yaml
proposed_fix: "A `unit` job in the frontend checks workflow runs `npm test` (web, packages, mobile) on every PR, path-filtered like typecheck."
opened: 2026-09-16T21:30:00Z
---

# B-092 — No PR check ran the frontend unit suites

**Source:** found by the coordinator assembling batch 2 on 2026-09-16: the three E2E guards
(rendered-text, role-name, bilingual alternation) are vitest tests, and the PR checks were
typecheck, pytest ×2, one Alembic head, APK and Maestro — no vitest anywhere. Four files
that violated the guards were green on every PR and failed together on the batch branch.
Ledger number from Session A's reserved range (unconfirmed until the coordinator vetoes).

**What happens:** a guard that only runs when someone types `npm test` is a guard that runs
at batch time, by the integrator, on everyone's work at once — the worst moment to learn
about it (R-032: a check that cannot find what it came for must fail loudly; here it could
not run at all).

**Resolution (2026-09-16, Session A):** `checks-frontend.yaml` gains a `unit` job beside
`typecheck`, same paths filter, same Node (24.15.0), `npm ci` then the root `npm test`
(web, then packages, then mobile — what a developer runs locally). About two minutes. The
job always runs and reports success on a non-frontend PR; the expensive steps are the ones
that get skipped, so it can be a required check without blocking backend-only PRs.

**Rule this reinforces:** every guard test must be wired into a PR check the day it is
written; a guard that runs only on the batch is a batch-time surprise, not a guard.
