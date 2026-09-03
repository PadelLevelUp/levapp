---
path: frontend/apps/web/src/components/attendance/AttendanceChart.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 196
size_tokens: 1580
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5597be5036ecf4b4bb291417e467836b5103fc31675ba34c94035a286165cd7f"
---

## Purpose

PAD-114 attendance-counts-per-period bar chart, built on `recharts` via the shadcn `ChartContainer`/`ChartTooltip` wrappers. A single series (no legend needed) whose bucket labels are formatted UTC-pinned per `granularity` (day/month/year), with a weekday-vs-day-number switch for 7-bucket weeks vs longer day ranges. Explicitly disables Recharts' grow-in bar animation (`isAnimationActive={false}`) because a throttled `requestAnimationFrame` (background tab, headless test runner, reduced motion) otherwise leaves every `<Bar>` at zero height forever, silently rendering as "no attendance" — a documented gotcha (see also `recharts-zero-height-bars` project memory) rather than a style choice.

## Connections

Uses: `frontend/apps/web/src/components/attendance/dateRanges.ts` — `parseIsoDate` to turn each bucket's UTC start string into a `Date` for the `Intl.DateTimeFormat` label formatters.

Used by: no file within this scope imports `AttendanceChart`; consumed by an attendance/absences page component outside `web-components-a` (likely `apps/web/src/pages`).
