---
path: frontend/apps/web/src/components/presences/PresenceCharts.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 242
size_tokens: 1767
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5cc05d4635dd2384a1533ccd87d3fbe7c9a3f8c2a6b8d7104233542b09081f4e"
---

## Purpose

Three Recharts views of the same attendance data (PAD-140): a bar chart of the top 8 players by total presences (names shortened to "First L." so eight labels fit the axis), a pie chart of private-vs-academy class split, and a line chart of the trend over the selected `granularity` (day/month/year, formatted via `Intl.DateTimeFormat` pinned to `timeZone: "UTC"` so a bucket's date string doesn't shift a day depending on the viewer's local timezone). Every series sets `isAnimationActive={false}` — its own comment states this is load-bearing, not styling: Recharts leaves bars as empty `<g>` elements when the mount animation runs under a throttled rAF (headless tests, background tabs), so an animated chart can render blank.

## Connections

Uses: `recharts` (`Bar`, `BarChart`, `CartesianGrid`, `Cell`, `Line`, `LineChart`, `Pie`, `PieChart`, `XAxis`, `YAxis`); `@/components/ui/chart` (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartConfig`); `@/components/ui/skeleton`; `@/types` (`AttendanceGranularity`, `PresencePlayerStats`, `PresenceStatsTotals`, `AttendanceBucket`).

Used by: a presences/attendance page (outside this scope), which supplies `players`, `totals`, `trend`, `granularity`, `loading`.

Semantically related (not imports): explicitly cites `AttendanceChart` (outside this scope) as carrying the same `isAnimationActive={false}` load-bearing note — the same Recharts zero-height-bars gotcha applies there too.
