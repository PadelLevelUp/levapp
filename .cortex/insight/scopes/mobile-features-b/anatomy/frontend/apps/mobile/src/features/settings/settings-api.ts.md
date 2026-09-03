---
path: frontend/apps/mobile/src/features/settings/settings-api.ts
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 75
size_tokens: 683
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "22f8d69178d2cc3d75f4a3fedd06bd17c7b78cc46b1fafadd9fe700212c5cf80"
---

## Purpose

Thin REST wrappers for seasons and data-import endpoints (`getSeasons`/`addSeasons`/`deleteSeason`, `getImportHistory`/`revertImport`), deliberately kept feature-local rather than lifted into `packages/api`. The doc comment gives the exact reason: neither resource exists in the shared package yet (checked — `packages/api/src/resources/` has no `seasons.ts` or `import.ts`; web calls its own `apps/web/src/api/{seasons,import}.ts`), and this stream was not to edit `packages/api/src/index.ts` while another stream was concurrently lifting shared code into that package. It uses `getApi()`, the same axios singleton every other resource module uses, so auth headers and the rolling-refresh interceptor apply identically. It also documents a real API/type mismatch measured against the live E2E backend: `GET /api/app/seasons`/`/app/import/history` responses have `id` as a NUMBER even though `@levelup/types`' `Season` declares `id: string` — web has the same mismatch and round-trips the raw value, so this module types `id` honestly as `string | number` here too, round-tripped unchanged so upserts address the same row web would.

## Connections

Uses (external, not in this scope): `@levelup/api`'s `getApi()` axios singleton for all requests.

Used by:
- `frontend/apps/mobile/src/features/settings/import-section.tsx`: imports `getImportHistory`, `revertImport`, `ImportHistoryEntry`.
- `frontend/apps/mobile/src/features/settings/seasons-section.tsx`: imports `addSeasons`, `deleteSeason`, `getSeasons`, `SeasonUpsert`.

(Both consumer edges are visible via direct import statements in those files; neither is captured as a resolved in-scope edge in this scope's L1 data.)
