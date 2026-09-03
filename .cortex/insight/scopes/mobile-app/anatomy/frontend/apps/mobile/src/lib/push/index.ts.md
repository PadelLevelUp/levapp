---
path: frontend/apps/mobile/src/lib/push/index.ts
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 3
size_lines: 16
size_tokens: 116
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "efef92ca00cd5df898d67f6f02f4dfaa37d76918345d039db7bb2cd35c535ad4"
---

## Purpose

The public entrypoint of the push module: `getPushRegistrar()` singleton factory over `ExpoPushRegistrar`, re-exporting `PUSH_TOKEN_ENDPOINT` and the `PushRegistrar` type. This is the module `AuthContext` imports as `@/lib/push` — it never talks to `ExpoPushRegistrar` or `expo-notifications` directly.

## Main players

- `getPushRegistrar` (lines 7–12) — critical. Lazily constructs and caches a single module-level `ExpoPushRegistrar` instance (`instance`), so the app has exactly one registrar and therefore one token flow (see `expoPushRegistrar.ts`'s Insights on why the cached `currentToken` needs a stable instance).

## Connections

Uses:
- `frontend/apps/mobile/src/lib/push/expoPushRegistrar.ts`: `ExpoPushRegistrar` class, `PUSH_TOKEN_ENDPOINT` re-export (resolved by L1 — genuine structural edge).
- `frontend/apps/mobile/src/lib/push/types.ts`: `PushRegistrar` type, re-exported (resolved by L1 — genuine structural edge).

Used by: no in-scope file is captured in L1's structural edges (the `@/lib/push` alias goes unresolved), but by direct reading `getPushRegistrar()` is called from `frontend/apps/mobile/src/auth/AuthContext.tsx` on login, silent-restore, and logout.

## Query pointers

If you need to swap the push implementation (e.g. for a non-Expo build), this is the one seam to change — implement `PushRegistrar` (see `./types.ts`) and swap the constructor call here; nothing outside this module needs to change.
