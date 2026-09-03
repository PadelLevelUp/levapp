---
path: frontend/apps/mobile/src/features/dashboard/DashboardBlocks.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 392
size_tokens: 3501
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0fc4ff231929b05f105048d6c816f78460fb164cf777ebaf132e75df31c0ccb3"
---

## Purpose

Generic block-type renderer for the older / player-facing dashboard payload: `kpi_grid`, `class_list`, `messages_overview`, `notification_activity`, and `grid` (flattened into a plain single-column stack on mobile, since there's no room for a real grid). Carries backend-i18n-key mapping tables (`KPI_LABEL_KEYS`, `LIST_TITLE_KEYS`, `LIST_EMPTY_KEYS`) because the backend emits KPI labels and list titles as English literals keyed by a stable slug/block-id — these are translated through the map (PAD-77) rather than the raw string, kept identical to web's own map on purpose after the two platforms drifted once already. `badgeLabel` similarly regex-translates the backend's `"Missing <n>"` literal through an i18n count key.

## Connections

Uses:
- `frontend/apps/mobile/src/features/calendar/params.ts` (in scope, via `@/features/calendar/params`): `parseDashboardItemId`, called from `openClassListItem` to route a tapped class-list row to the class detail screen. NOT present in this file's L1 `resolvedImports` (see `params.ts`'s entry) — confirmed directly from the source (line 19).
- `@levelup/config` (frontend/packages/config/src/index.ts): `lightTheme`.
- `@levelup/types` (frontend/packages/types/src/index.ts): `DashboardBlock` and its per-block-type variants.
- `expo-router`, `date-fns` (`formatDistanceToNow`).
- `@/components/ui/{badge,card,text}`, `@/lib/utils` (outside this scope): `cn`.

Used by: none within this scope — rendered by the (older) dashboard tab screen outside this slice.

Semantically related (not imports): `frontend/apps/mobile/src/features/dashboard/CoachDashboard.tsx` renders the rebuilt coach block set from the same `DashboardBlock[]` payload type; `isCoachDashboard` (exported there) is the runtime switch between the two renderers.
