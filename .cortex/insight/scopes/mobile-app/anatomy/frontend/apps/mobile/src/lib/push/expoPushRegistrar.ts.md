---
path: frontend/apps/mobile/src/lib/push/expoPushRegistrar.ts
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 3
size_lines: 99
size_tokens: 835
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "1609ca2a4667c8d751d8cf5692c367946168def85600f4f58b67416f78c9e866"
---

## Purpose

The `expo-notifications`-backed implementation of `PushRegistrar`: requests permission, obtains an Expo push token, and syncs/removes it against the backend's device-token endpoint. Every step is designed to fail silently — missing permissions, running on a simulator, or a network error all resolve rather than throw, so callers (`AuthContext`) can fire-and-forget.

## Main players

- `PUSH_TOKEN_ENDPOINT` (line 17) — critical. `"/notifications/device"`, the same path used for both register (POST) and unregister (DELETE), unprefixed because `api`'s `baseURL` already includes `/api`.
- `class ExpoPushRegistrar implements PushRegistrar` (lines 24–98) — critical. Implements the two-method contract from `./types`.
  - `getDeviceToken` (private, lines 29–39) — supporting. Returns `null` on a simulator (`!Device.isDevice`); otherwise fetches the Expo push token, passing the EAS `projectId` (from `Constants.expoConfig?.extra?.eas?.projectId` or `Constants.easConfig?.projectId`) when available.
  - `register` (lines 41–76) — critical. Simulator check → Android notification channel setup → permission check/request → token fetch → caches the token on `this.currentToken` → `POST` to the backend. Every step early-returns silently on failure.
  - `unregister` (lines 78–97) — critical. Uses the cached `currentToken` if present; otherwise re-derives it WITHOUT prompting for permission again (only if already granted), then `DELETE`s it from the backend.

## Insights

- `unregister()`'s no-reprompt fallback exists for a specific scenario noted in a comment: "app was killed and relaunched straight into logout" — `currentToken` would be empty (a fresh class instance), but re-requesting permission at logout would be jarring, so it only re-derives the token if permission is ALREADY granted and gives up silently otherwise.
- The class caches `currentToken` as private instance state rather than persisting it, which means `getPushRegistrar()`'s singleton-ness (see `./index.ts`) is load-bearing: a fresh `ExpoPushRegistrar` instance per call would lose the cached token between register and unregister.

## Connections

Uses:
- `frontend/apps/mobile/src/lib/push/types.ts`: `PushRegistrar` interface (resolved by L1 — a genuine structural edge, `implements`).
- `frontend/apps/mobile/src/lib/api.ts`: `api` (for the POST/DELETE calls) — unresolved alias `@/lib/api`, not in L1's resolved graph, but a genuine dependency confirmed by reading the file.
- `expo-constants`, `expo-device`, `expo-notifications`, `react-native` (`Platform`): outside this scope, third-party.

Used by:
- `frontend/apps/mobile/src/lib/push/index.ts` (resolved by L1 — genuine structural edge: `getPushRegistrar()` constructs `new ExpoPushRegistrar()`).

## Query pointers

If push registration silently isn't reaching the backend, check `Device.isDevice` first — every path in `register()`/`unregister()` no-ops on a simulator, which is correct behavior, not a bug.
If you need to change the device-token endpoint contract, `PUSH_TOKEN_ENDPOINT` is the one place it's defined — both register and unregister share it.
