---
path: frontend/apps/web/e2e/helpers/calendar-navigation.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 85
size_tokens: 825
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d98285bb2c2cccce59698bb02fc76cc84c74c906d04571873bc656f71ccedc76"
---

## Purpose

Calendar week-navigation helpers shared by specs that need to find or step
through calendar weeks: `goToNextWeek`/`goToPreviousWeek` click the
toolbar button and wait for the week's `/api/app/calendar?from=...`
response (deterministic, unlike a fixed timeout), and `findClassOnCalendar`
searches forward for a titled event across up to `maxWeeks` weeks, falling
back to a second, patient backward rescan if the fast pass finds nothing —
because the fast pass only waits for the API response, not the React
render that turns it into event cards, and under cumulative suite load
that render can outlast the fast per-week budget and cause a false
"class not found".

## Connections

- Uses: — (only `@playwright/test` types)
- Used by: `availability/unavailable-student-notifications.spec.ts` (this
  scope, via `goToNextWeek`); also imported by several sibling-scope files
  (schedule-calendar and notification-engine specs, outside this scope)
  for the same week-stepping and class-finding needs.
- Semantically related (not imports): fixes the specific flake documented
  for `schedule-calendar/participant-count-effective.spec.ts` (sibling
  scope) — a ~1-in-3 full-run-only failure that was a render race, not
  cross-spec pollution.
