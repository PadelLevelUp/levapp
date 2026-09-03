---
path: frontend/apps/web/src/hooks/useAutoInviteEnabled.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 4
size_tokens: 20
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2a3ec808dc917f8c0d6d7602169dece327faa2c924f77ed260e40e00be07990f"
---

## Purpose

A thin re-export barrel: `import "@/api/client"` for the `initApi()` side effect (this hook fetches through `getApi()` internally), then `export { useAutoInviteEnabled } from "@levelup/hooks"` — a plain `useEffect`/`useState` hook (not TanStack Query) fetching `NotificationConfig.autoNotifyEnabled`, defaulting to `false` before resolution or on error. Same shape as `useFieldAvailability.ts`.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect, needed since the re-exported hook calls `getApi()`.
- `@levelup/hooks` (outside scope): re-exports `useAutoInviteEnabled`.

Used by: no file within this scope.

Semantically related (not imports): `frontend/apps/web/src/hooks/useFieldAvailability.ts`, `useCalendar.ts` — the other `@levelup/hooks` re-export barrels in this directory.
