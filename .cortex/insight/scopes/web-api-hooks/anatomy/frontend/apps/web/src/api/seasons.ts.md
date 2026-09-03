---
path: frontend/apps/web/src/api/seasons.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 42
size_tokens: 259
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "49d16b51aaf77160c2094fc36cdf8f550ef86feca8d47a2629a0bac95c55b24e"
---

## Purpose

Season CRUD (`getSeasons`, `addSeasons`, `deleteSeason`) plus the `SeasonUpsert` upsert-shape type (its doc comment: an `id` addresses an already-persisted season for an in-place update, omitting it creates a new one — PAD-89). Unlike every other CRUD-shaped file in this directory, it calls `api.get`/`api.post` directly against `/app/seasons`, `/app/add_seasons`, `/app/delete/season` rather than delegating to a `@levelup/api/src/resources/*` module — **there is no `@levelup/api/src/resources/seasons.ts`**, so this file duplicates the raw-axios pattern `editor.ts`/`import.ts` use, but for a domain (seasons) that every other domain in this scope has a shared-package resource module for. This is a real package/app duplication gap: season CRUD logic lives only here, unshared with mobile.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: the exported `api` axios instance, used directly (no `@levelup/api/src/resources/seasons` to delegate to).

Used by: no file within this scope (its consumer is season-management UI, outside `api/`/`hooks/`/`data/`).

Semantically related (not imports): `frontend/apps/web/src/api/editor.ts`, `import.ts` — the other files calling the raw `api` instance directly instead of a `@levelup/api` resource module, though for those two that's because the surface is web-only/streaming, not because a package module is missing.
