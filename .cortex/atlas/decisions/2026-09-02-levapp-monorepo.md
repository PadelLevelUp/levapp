---
id: decision.2026-09-02-levapp-monorepo
title: Merge backend and frontend into the levapp monorepo; keep the issue bot separate
date: 2026-09-02T20:00:00Z
provenance:
  - derives_from: archive/documents/2026-09-03-monorepo-cortex-workspace-handoff/source.md
  - derives_from: claude-sessions/pedro/session_0198iAmzyjfYiqu3DJSzaLLC
---

# Merge backend and frontend into the levapp monorepo

On 2026-09-02 the owner chose to merge `levelup_backend` and `levelup_frontend` into one public repo, `PadelLevelUp/levapp`, with `git filter-repo` preserving history under `backend/` and `frontend/`. The case was not cost (GitHub bills per user): the spec tree lived in an unversioned umbrella directory, the "web and iOS ship together" rule spanned two repos so every full-stack ticket was two PRs, and every pipeline change was done twice. The repos shared no code (backend→frontend references: 0), so the merge was a file move. `levelup_issue_bot` stays separate — no shared code, its own runtime, and its ticket-prompt strings are a contract with the skills. The frontend's npm-workspace root stays at `frontend/` so Metro, the Dockerfile and `-w` scripts are untouched; Docker image and container names were deliberately kept (`levelup_*`) so the cutover was a no-op on the VM. The old frontend history carried a committed `.env` with a Supabase anon key; it was purged during the rewrite.
