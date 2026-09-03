---
path: frontend/packages/api/src/client.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 3
size_lines: 74
size_tokens: 500
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2c811851481bf76455e9e2e50493b8b8f11d16ff522dae0b9469622d18b96f32"
---

## Purpose

Builds the axios instance that every resource module in `@levelup/api` calls through, wiring up the app's whole auth contract in one place: attach the bearer token on the way out, persist a rolling-refresh token on the way in, and clear the session on a 401. It also holds a module-level singleton (`initApi`/`getApi`) so the rest of the codebase never has to thread a client instance through props.

## Main players

- `ApiClientOptions` (interface, lines 4–13) — critical. `baseURL`, an injected `TokenStorage`, and an optional `onUnauthorized` callback fired after a 401 (called once the token is already gone from storage).
- `createApiClient` (lines 21–55) — critical. Creates the axios instance and installs the request interceptor (attach `Authorization: Bearer <token>`) and response interceptor (persist `x-new-token`, clear token + fire `onUnauthorized` on 401).
- `initApi` (lines 60–63) — critical. Creates the client and stores it as the module singleton.
- `getApi` (lines 66–73) — critical. Returns the singleton; throws `"@levelup/api: initApi() must be called..."` if called first.

## Insights

- The rolling-refresh header (`x-new-token`) is checked on EVERY response, not just auth endpoints — the server can rotate the token on any request, and this interceptor is what keeps the client's stored token in sync with that.
- `onUnauthorized` fires strictly AFTER `storage.removeToken()` has already resolved — a caller that reads storage synchronously inside the callback will see it already cleared, never the stale token.
- `storage` and `baseURL` are injected rather than imported, which is the whole point of the package being platform-neutral: web supplies localStorage-backed storage, mobile supplies AsyncStorage/SecureStore, tests supply an in-memory stub (see `client.test.ts`).
- The singleton (`apiSingleton`) means only one client is live per JS runtime; tests deliberately bypass it via `createApiClient` directly so they don't fight over shared module state.

## Connections

Uses:
- `frontend/packages/api/src/storage.ts`: imports the `TokenStorage` type the client is parameterized over.

Used by:
- `frontend/packages/api/src/index.ts`: re-exports `createApiClient`, `initApi`, `getApi`, `ApiClientOptions` as the package's public surface.
- `frontend/packages/api/src/client.test.ts`: exercises the interceptor chain directly via `createApiClient` (bypassing the singleton) and tests the `initApi`/`getApi` guard.
- Every file in `frontend/packages/api/src/resources/*.ts`: calls `getApi()` to make requests — this is the one chokepoint all outbound HTTP traffic passes through.

## Query pointers

If you need to add a new authenticated resource call, read this file's `getApi()` usage pattern, then any file in `resources/` as a template — none of them touch auth directly, they just call `getApi()`.
If you need to change session/auth behavior (token refresh, logout redirect), read the two interceptors here first, then `storage.ts`, then whichever platform shell calls `initApi` (`apps/web`, `apps/mobile` — outside this scope) to see what `onUnauthorized` actually does per platform.
