---
path: frontend/packages/api/src/index.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 3
size_lines: 24
size_tokens: 312
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c2c797ddc049e4b475532d3ba1fec5f46ccdc602d61b6b213d099072779b452a"
---

## Purpose

The public entrypoint of `@levelup/api`: re-exports the client (`createApiClient`/`initApi`/`getApi`), `TokenStorage`, `buildEventsUrl`, and every resource module namespaced as `<name>Api` (e.g. `playersApi`, `notificationEngineApi`). This is the surface `apps/web` and `apps/mobile` (outside this scope) are meant to import from.

## Main players

- Barrel re-exports (lines 1–23) — critical. `export * as <x>Api from "./resources/<x>"` for all 18 resource modules, plus the client/storage/sse re-exports.

## Insights

- Resource modules are deliberately namespaced (`export * as authApi`, `export * as playersApi`, …) rather than flattened, specifically to avoid name collisions between resources — several resource files export similarly-named CRUD functions (e.g. multiple modules export something shaped like `getX`/`addX`/`deleteX`).
- Within this scope, nothing actually imports through this barrel: `frontend/packages/hooks/src/queries.ts`, `queryKeys.ts`, `useAutoInviteEnabled.ts`, and `useFieldAvailability.ts` all import resource modules DIRECTLY via `@levelup/api/src/resources/<x>` rather than via the namespaced barrel. This file's consumers are outside the scope (`apps/web`, `apps/mobile`).

## Connections

Uses:
- `frontend/packages/api/src/client.ts`, all of `frontend/packages/api/src/resources/*.ts`, `frontend/packages/api/src/sse.ts`: everything it re-exports.

Used by: no file within this scope (its consumers are apps/web and apps/mobile, outside `packages/`).

## Query pointers

If you need to add a new resource module, read this file to see the barrel pattern, then add both the new file under `resources/` and its `export * as <name>Api from "./resources/<name>"` line here.
If you're chasing why a hooks-package import "works" without going through this barrel, read `frontend/packages/hooks/src/queries.ts` — it imports resource modules by their direct subpath, not through this file.
