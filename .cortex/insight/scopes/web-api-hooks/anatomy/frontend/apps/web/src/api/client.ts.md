---
path: frontend/apps/web/src/api/client.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 3
size_lines: 32
size_tokens: 197
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "cbb45b2a2d0409a7616a18534873685f7dc245422a1229c9b1fda4ae41664a22"
---

## Purpose

The web app's platform adapter for `@levelup/api`: supplies the localStorage-backed `TokenStorage` implementation, wires a 401 handler that redirects to `/auth?next=<path>`, and calls `initApi` once at module-load time so every other web `api/*.ts` module can simply `import "@/api/client"` (or `import { api } from "@/api/client"`) and get a live client. This is the ONE file in the scope that touches `@levelup/api`'s client/singleton surface directly — every resource wrapper module imports it purely for its side effect of initializing the singleton before calling `getApi()`-backed resource functions.

## Main players

- `webTokenStorage` (lines 6–15) — critical. Implements `@levelup/api`'s `TokenStorage` contract over `localStorage`'s `"accessToken"` key. This is the web half of the platform-neutral storage injection `@levelup/api/src/client.ts` documents (mobile supplies its own AsyncStorage/SecureStore implementation, outside this scope).
- `redirectToAuth` (lines 17–23) — critical. The `onUnauthorized` callback passed to `initApi`: guards against redirect loops (no-ops if already on `/auth`) and preserves the current path+query as a `next` param so login can return the user where they were.
- Module-level `initApi(...)` call (lines 25–29) — critical. Runs once, at import time, with `baseURL: "/api"` (proxied by Vite in dev, nginx in prod — see the CLAUDE.md's `USE_MOCK_DATA`/proxy notes).
- `export const api = getApi()` (line 31) — critical. The raw axios instance, used directly by the handful of modules that don't go through a `@levelup/api` resource wrapper (`api/editor.ts`, `api/import.ts`, `api/seasons.ts`).

## Insights

- Because `initApi` runs as a side effect of the module simply being imported, most other files in this scope import it ONLY for that side effect (`import "@/api/client";` with no bindings) — the actual HTTP call still goes through the separately-imported `@levelup/api/src/resources/<x>` module. Removing that bare import without realizing the singleton depends on it would make every `getApi()` call inside those resource modules throw `"@levelup/api: initApi() must be called..."`.
- `api/seasons.ts` and `api/editor.ts` are the two files that import `{ api }` directly and issue raw `api.get`/`api.post` calls instead of going through a matching `@levelup/api/src/resources/*` module — `seasons` has no such resource module at all (see `api/seasons.ts` insight), and `editor.ts` is a web-only admin surface with no package-level equivalent.
- The redirect-loop guard (`window.location.pathname !== authPath`) matters because a 401 firing WHILE already on `/auth` (e.g. a stale token still attached to a background request) would otherwise re-navigate to `/auth` repeatedly.

## Connections

Uses: `@levelup/api` (`initApi`, `getApi`, `TokenStorage` type) — outside this scope.

Used by:
- Nearly every file in `frontend/apps/web/src/api/*.ts` (all except `events.ts`, which imports `@levelup/api` directly for `buildEventsUrl`): imported for the `initApi()` side effect, or (in `editor.ts`, `import.ts`, `seasons.ts`) for the exported `api` axios instance.
- `frontend/apps/web/src/hooks/useAutoInviteEnabled.ts`, `frontend/apps/web/src/hooks/useFieldAvailability.ts`: same side-effect-only import pattern, ahead of using `@levelup/hooks` hooks that call `getApi()` internally.
- `frontend/apps/web/src/api/fields.ts`: imports via relative `./client` (this is the one edge L1 resolved within this scope).

## Query pointers

If you need to change session/auth behavior on web (token storage key, redirect target, 401 handling), this file is the whole story for web — it's a thin adapter, the actual interceptor logic lives in `@levelup/api/src/client.ts` (outside this scope).
If you're wondering why a resource wrapper file that never references `client.ts`'s exports still imports it, it's the side-effect-only pattern — check for `import "@/api/client";` with no bound name before assuming the import is dead.
