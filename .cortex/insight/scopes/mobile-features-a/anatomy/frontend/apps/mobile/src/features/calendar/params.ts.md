---
path: frontend/apps/mobile/src/features/calendar/params.ts
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 102
size_tokens: 818
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "155b3d88f880c207df3738bcf5adad556102b4e8383a3d8972bc51157a595488"
---

## Purpose

Serializes a `CalendarEvent` to/from Expo Router's string query params (`ClassRouteParams`, via `eventToParams`/`paramsToEvent`) so the class detail screen (`app/class/[id]`) can rebuild the event needed by `POST /app/class_instance` without refetching the whole week — including display-only fallbacks (`displayDate`/`displayTime`) used when the screen is opened from the dashboard, where only pre-formatted labels are available. Also exports `parseDashboardItemId`, which decodes a dashboard class-list item id — `"lessoninstance-12"`, `"lesson-3"`, or `"lesson-3-2026-07-07"` for a recurring occurrence — into `{ model, originalId, date }`.

## Connections

Uses:
- `@levelup/types` (frontend/packages/types/src/index.ts): `CalendarEvent`, `ClassType`.

Used by:
- `frontend/apps/mobile/src/features/dashboard/DashboardBlocks.tsx` (in scope, via `@/features/calendar/params`): `parseDashboardItemId`, called from `openClassListItem` to route a dashboard class-list tap into the class detail screen. NOTE: this edge is not present in the L1 `resolvedImports` for `DashboardBlocks.tsx` (likely an alias-resolution gap in the L1 pass) — confirmed directly from the source (`DashboardBlocks.tsx` line 19).
