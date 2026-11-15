---
about: "Merge backend and frontend into the levapp monorepo; keep the issue bot separate"
permanence: changing
verified: "2026-09-02 (told)"
origin:
  - migrated:atlas/decisions/2026-09-02-levapp-monorepo.md@ef7a5f3
  - source:history/sources/2026-09-03-monorepo-cortex-workspace-handoff.md
  - session:session_0198iAmzyjfYiqu3DJSzaLLC
aliases:
  - decision.2026-09-02-levapp-monorepo
  - 2026-09-02-levapp-monorepo
---

## Answer

# Merge backend and frontend into the levapp monorepo

On 2026-09-02 the owner chose to merge `levelup_backend` and `levelup_frontend` into one public repo, `PadelLevelUp/levapp`, with `git filter-repo` preserving history under `backend/` and `frontend/`. The case was not cost (GitHub bills per user): the spec tree lived in an unversioned umbrella directory, the "web and iOS ship together" rule spanned two repos so every full-stack ticket was two PRs, and every pipeline change was done twice. The repos shared no code (backend→frontend references: 0), so the merge was a file move. `levelup_issue_bot` stays separate — no shared code, its own runtime, and its ticket-prompt strings are a contract with the skills. The frontend's npm-workspace root stays at `frontend/` so Metro, the Dockerfile and `-w` scripts are untouched; Docker image and container names were deliberately kept (`levelup_*`) so the cutover was a no-op on the VM. The old frontend history carried a committed `.env` with a Supabase anon key; it was purged during the rewrite.

## Why

The reasons are part of the answer above: a 3.x narrative decision, migrated verbatim.

## Rejected

none recorded
