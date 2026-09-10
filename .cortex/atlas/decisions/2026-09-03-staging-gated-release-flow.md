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

**Addendum 2026-09-06 (PAD-200).** Staging's database is refreshed from production on every
staging deploy — a full replace of `padel_app_staging` from `padel_app`, streamed dump → restore
with no file on the VM's disk, the staging app stopped for the copy and restarted afterwards so
its entrypoint's `flask db upgrade` applies whatever migrations staging carries beyond prod. The
copy is deliberately best-effort (`continue-on-error` on the job, `exit 0` on every guard in the
script): staging data is a convenience, the deploy is not. No anonymisation was wanted — staging
holds no push, mail or AI credentials, so copied students cannot be contacted from it — but a
**safety scrub** runs after every copy so that stays true even if staging later gains those
credentials: push subscriptions and device tokens are emptied and every email is rewritten to
`user<id>@staging.invalid`. Names, phones, passwords, classes and messages stay real; login is by
username, so prod credentials keep working. Consequence: staging is never a place to keep
anything; it is prod as of the last deploy, minus every outbound channel.

**Addendum 2026-09-10 (B-059).** Because the sync copies prod first, staging's `alembic_version`
goes back to prod's on every staging deploy. The entrypoint's `flask db upgrade` then re-runs every
migration between prod's revision and staging's head, on prod's data, before gunicorn starts. Until
`main` catches up, every staging deploy pays for every pending migration again, and the staging API
answers 502 for as long as they take. The sync stops the staging container for the copy and starts
it again, and it runs beside the backend job, so an upgrade already under way can be cut off and
start over. That is the point of the copy: a slow or data-sensitive migration shows up on staging on
every deploy. It costs prod the same downtime once, at promotion, so a migration that is slow on
staging must be made fast before it is promoted.
