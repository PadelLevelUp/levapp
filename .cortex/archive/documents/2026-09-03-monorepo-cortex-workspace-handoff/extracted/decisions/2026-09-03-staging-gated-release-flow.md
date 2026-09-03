---
id: decision.2026-09-03-staging-gated-release-flow
title: Releases go feature → staging → main through pull requests only
date: 2026-09-03T00:30:00Z
provenance:
  - derives_from: archive/documents/2026-09-03-monorepo-cortex-workspace-handoff/source.md
  - derives_from: claude-sessions/pedro/session_0198iAmzyjfYiqu3DJSzaLLC
---

# Releases go feature → staging → main through pull requests only

Chosen 2026-09-02/03. `staging` auto-deploys `staging.levapp.app` (same VM as prod, own containers and database, memory-capped, no push/AI/GCS/mail credentials so it can never reach real users). `main` auto-deploys prod. Rulesets block direct pushes and force-pushes on both; because GitHub cannot restrict a PR's source branch natively, the `guard-main-source` workflow fails any PR into `main` whose head is not `staging` and is a required check. Deploy ordering moved inside the workflow (`changes → backend → frontend`), replacing the two-repo "merge backend first" convention; a `target` dispatch input covers the rare frontend-first release. `/batch-merge-prs` was reworked to integrate on a batch branch and open the two PRs rather than push `staging`. The first change through the flow exposed that the API could not boot without an LLM key — exactly the class of defect the gate exists to catch before prod. `padellevelup.com` must keep serving prod (the shipped iOS binary hardcodes it), so it can never become the staging hostname.
