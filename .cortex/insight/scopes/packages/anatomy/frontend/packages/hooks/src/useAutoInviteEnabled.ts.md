---
path: frontend/packages/hooks/src/useAutoInviteEnabled.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 32
size_tokens: 172
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3d6e6de3bc85c2795de4d862e0b8bcc6d473598fa4f909b629c3a1335af26572"
---

## Purpose

`useAutoInviteEnabled(enabled = true)` — fetches `NotificationConfig.autoNotifyEnabled` via a plain `useEffect`/`useState` (not TanStack Query, unlike everything in `queries.ts`), defaulting to `false` both before the fetch resolves and on any fetch error, with a `mounted` guard against setting state after unmount.

## Connections

Uses:
- `frontend/packages/api/src/resources/notificationEngine.ts` (via `@levelup/api/src/resources/notificationEngine`): `getNotificationConfig`, called directly rather than through a `queries.ts` hook.

Used by:
- `frontend/packages/hooks/src/index.ts`: re-exported by name.
