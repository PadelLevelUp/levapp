---
path: frontend/apps/web/src/components/calendar/CalendarHeader.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 42
size_tokens: 335
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "33d498192f56b55175aa3cf80464babc962fe6d669c3d9a130f135a8a6b90175"
---

## Purpose

The 7-column day-name/day-number header row sitting above `CalendarGrid`'s time grid, with a 60px spacer to align with the time column. Highlights today's date with a filled circle. Purely presentational — takes `weekDays: Date[]` and renders `date-fns` `format` output localized via `dateFnsLocale(i18n.language)`.

## Connections

Uses: none within this scope; imports `date-fns` (`format`, `isToday`), `react-i18next`, `@/lib/utils`, `@/lib/dateLocale` (`dateFnsLocale`) — all outside this scope.

Used by: no file within this scope imports `CalendarHeader`; paired with `CalendarGrid` by the desktop calendar page (outside `web-components-a`).
