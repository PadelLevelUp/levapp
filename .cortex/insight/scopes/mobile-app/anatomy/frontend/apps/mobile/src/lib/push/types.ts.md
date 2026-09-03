---
path: frontend/apps/mobile/src/lib/push/types.ts
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 3
size_lines: 12
size_tokens: 116
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3cb7669e4f6f094cd809ae36bb2880064bf1e8f77ae3b815fce5c4ee78475156"
---

## Purpose

Defines the `PushRegistrar` abstraction (`register()` / `unregister()`) so the rest of the app never talks to `expo-notifications` directly — the doc comment states both methods MUST be safe to call anywhere: they never throw, never reject.

## Main players

- `interface PushRegistrar` (lines 6–11) — critical. Two async methods: `register()` (request permission, obtain a token, sync to backend) and `unregister()` (remove this device's token, e.g. on logout). The entire contract for this seam.

## Insights

- The "never throws, never rejects" contract stated in the doc comment is what makes every call site in `AuthContext.tsx` safe to fire-and-forget (`void getPushRegistrar().register()`) without a `.catch()` — `ExpoPushRegistrar`'s implementation upholds this by catching every internal failure and logging instead of propagating.

## Connections

Uses: none (a pure type-only file).

Used by:
- `frontend/apps/mobile/src/lib/push/expoPushRegistrar.ts` (resolved by L1 — genuine structural edge: `ExpoPushRegistrar implements PushRegistrar`).
- `frontend/apps/mobile/src/lib/push/index.ts` (resolved by L1 — genuine structural edge: re-exports the type).

## Query pointers

If you're adding an alternate push backend, implement this interface exactly — any deviation from the "never throws" contract will break every fire-and-forget call site that assumes it.
