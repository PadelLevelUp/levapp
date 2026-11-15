---
about: 2026-09-03-monorepo-cortex-workspace-handoff
permanence: stable
verified: "2026-09-03 (observed)"
origin:
  - migrated:archive/documents/2026-09-03-monorepo-cortex-workspace-handoff@ef7a5f3
  - session:session_0198iAmzyjfYiqu3DJSzaLLC
  - "external:that executed plans/2026-09-02-levapp-monorepo-cortex-migration.md; committed copy at docs/handoffs/"
aliases:
  - archive.2026-09-03-monorepo-cortex-workspace-handoff
captured: "2026-09-03"
raw: history/sources/raw/2026-09-03-monorepo-cortex-workspace-handoff.md
---

## summary

# Summary — monorepo cutover, Cortex adoption, Google Workspace (2026-09-02/03)

Three repos became one (`PadelLevelUp/levapp`, history preserved, old repos archived). Releases now flow feature → PR → `staging` (staging.levapp.app) → PR → `main` (levapp.app), enforced by rulesets and a source-branch guard. Cortex 3.3 was initialised at the root: 85 developer leaves migrated, 33 business outcomes authored, 24 compass rules, 14 ledger bugs (7 surfaced by insight extraction and filed as PAD-173…179), 679 insight entries and 26 concepts. The production JWT/session secret defect (B-003) was fixed with a startup guard and a one-time rotation. `levapp.app` gained Google Workspace (one seat, `admin@levapp.app`, aliases `noreply@`/`hello@`) with MX/SPF/DMARC in Cloudflare; DKIM is time-gated by Google until ~2026-09-06.

Full text: `docs/handoffs/2026-09-03-monorepo-cortex-workspace-handoff.md` (local-only — `docs/` is gitignored; this extraction is the committed record). Decisions extracted to `.cortex/atlas/decisions/` (see `extracted/decisions/`).

## 2026-09-02-levapp-monorepo

# Merge backend and frontend into the levapp monorepo

On 2026-09-02 the owner chose to merge `levelup_backend` and `levelup_frontend` into one public repo, `PadelLevelUp/levapp`, with `git filter-repo` preserving history under `backend/` and `frontend/`. The case was not cost (GitHub bills per user): the spec tree lived in an unversioned umbrella directory, the "web and iOS ship together" rule spanned two repos so every full-stack ticket was two PRs, and every pipeline change was done twice. The repos shared no code (backend→frontend references: 0), so the merge was a file move. `levelup_issue_bot` stays separate — no shared code, its own runtime, and its ticket-prompt strings are a contract with the skills. The frontend's npm-workspace root stays at `frontend/` so Metro, the Dockerfile and `-w` scripts are untouched; Docker image and container names were deliberately kept (`levelup_*`) so the cutover was a no-op on the VM. The old frontend history carried a committed `.env` with a Supabase anon key; it was purged during the rewrite.

## 2026-09-03-google-workspace-single-seat

# One Google Workspace seat, admin@levapp.app, as the company identity

On 2026-09-03 the owner bought Google Workspace Business Starter for `levapp.app` — one seat, not one per founder — after learning the price is €8.10 per user per *month*, not per year. The existing `the old Gmail console account` account was upgraded in place (not a new tenant), so it became `admin@levapp.app` while keeping ownership of Google Cloud, Cloudflare and the Chrome profile used for automation; the old Gmail address remains an alias. `noreply@` and `hello@` are free aliases on that seat; founder mailboxes are deferred ("if the other founders want"). Other services (GitHub org billing, Docker Hub, Cloudflare profile, Expo, Linear, Anthropic, OpenRouter) are to be re-pointed to `admin@levapp.app` by changing their email, never by creating new accounts — Docker Hub's `padelapp` namespace in particular is baked into every image name and workflow. The Apple Developer team stays an Individual account until a legal entity exists. DMARC starts at `p=none` and tightens after DKIM has run for a week.

## 2026-09-03-staging-gated-release-flow

# Releases go feature → staging → main through pull requests only

Chosen 2026-09-02/03. `staging` auto-deploys `staging.levapp.app` (same VM as prod, own containers and database, memory-capped, no push/AI/GCS/mail credentials so it can never reach real users). `main` auto-deploys prod. Rulesets block direct pushes and force-pushes on both; because GitHub cannot restrict a PR's source branch natively, the `guard-main-source` workflow fails any PR into `main` whose head is not `staging` and is a required check. Deploy ordering moved inside the workflow (`changes → backend → frontend`), replacing the two-repo "merge backend first" convention; a `target` dispatch input covers the rare frontend-first release. `/batch-merge-prs` was reworked to integrate on a batch branch and open the two PRs rather than push `staging`. The first change through the flow exposed that the API could not boot without an LLM key — exactly the class of defect the gate exists to catch before prod. `padellevelup.com` must keep serving prod (the shipped iOS binary hardcodes it), so it can never become the staging hostname.

<!-- 3.x fields of archive/documents/2026-09-03-monorepo-cortex-workspace-handoff, carried verbatim by cortex migrate -->
```yaml
kind: handoff
version: "2026-09-03"
status: active
source_filename: 2026-09-03-monorepo-cortex-workspace-handoff.md
origin: "Claude Code session session_0198iAmzyjfYiqu3DJSzaLLC that executed plans/2026-09-02-levapp-monorepo-cortex-migration.md; committed copy at docs/handoffs/"
```
