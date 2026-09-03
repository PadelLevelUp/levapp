---
path: frontend/apps/mobile/src/lib/api.ts
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 3
size_lines: 51
size_tokens: 397
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "23d073d9f81cc5d9a9bc626fb0f607ed26cb4040f6816449ddc1da2defd32825"
---

## Purpose

Instantiates the app's single `@levelup/api` client (`api`) bound to a `SecureStore`-backed `TokenStorage` adapter, and provides the fresh-install token-purge safeguard and the unauthorized-handler indirection that lets `AuthContext` (which imports this module) react to 401s without creating a module import cycle.

## Main players

- `purgeTokenOnFreshInstall` (lines 13–23) — critical. Detects a fresh app install via a marker file (`.installed`) in the document directory and deletes any stale SecureStore token if the marker is absent, since the iOS Keychain survives an app reinstall (and a test runner's clear-state) but the document directory does not.
- `secureTokenStorage` (lines 26–36) — critical. The `TokenStorage` implementation (`getToken`/`setToken`/`removeToken`) passed to `initApi`, backed by `expo-secure-store` under the fixed key `"accessToken"`.
- `setUnauthorizedHandler` / the module-level `unauthorizedHandler` variable (lines 40–44) — critical. Lets `AuthContext` register its own 401 handler (clear user state, route to `/login`) after mount, without this module needing to import `AuthContext` directly — breaking what would otherwise be an `api.ts` ⇄ `AuthContext.tsx` import cycle.
- `api` (lines 46–50) — critical. The `@levelup/api` singleton, created via `initApi({ baseURL: API_URL, storage: secureTokenStorage, onUnauthorized: () => unauthorizedHandler?.() })`; every other module in the app that makes an API call goes through this instance.

## Insights

- The unauthorized-handler indirection (a plain module-level closure variable, not a pub/sub library) is a deliberately minimal fix for a specific cycle: `api.ts` needs to call something on 401, but the thing that knows how to react (clear state, navigate) lives in `AuthContext.tsx`, which itself imports `api.ts`. A direct import either way would cycle; the indirection lets `AuthContext` register late (on mount) instead.
- `api` is created at MODULE LOAD TIME (not lazily inside a function), which is why `app/_layout.tsx` imports this module purely for its side effect (`import "@/lib/api"`) before any screen calls `getApi()` — the singleton must exist before the first consumer.

## Connections

Uses:
- `frontend/apps/mobile/src/lib/config.ts`: `API_URL` (resolved by L1 — a genuine structural edge).
- `@levelup/api` (`initApi`, `TokenStorage` type): outside this scope (packages).
- `expo-file-system` (`File`, `Paths`), `expo-secure-store`: outside this scope, third-party.

Used by: no in-scope file is captured in L1's structural edges, but by direct reading this module is imported by `frontend/apps/mobile/src/auth/AuthContext.tsx` (`api`, `purgeTokenOnFreshInstall`, `secureTokenStorage`, `setUnauthorizedHandler`), `frontend/apps/mobile/src/lib/sse.ts` (`secureTokenStorage`), `frontend/apps/mobile/src/lib/push/expoPushRegistrar.ts` (`api`), and `frontend/apps/mobile/app/login.tsx` (indirectly, via `@levelup/api`'s `getApi()` which returns this same singleton) and `frontend/apps/mobile/app/_layout.tsx` (side-effect-only import to register the singleton before any screen runs).

## Query pointers

If a request is silently unauthenticated or a 401 isn't triggering logout, check `setUnauthorizedHandler`'s registration in `AuthContext.tsx` first — this file only provides the hook point, not the actual reaction.
If you need to change the token storage mechanism, `secureTokenStorage` is the only place that talks to `expo-secure-store` directly — everything else goes through the `TokenStorage` interface from `@levelup/api`.
