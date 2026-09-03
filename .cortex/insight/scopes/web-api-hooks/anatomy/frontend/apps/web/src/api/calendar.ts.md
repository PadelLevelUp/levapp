---
path: frontend/apps/web/src/api/calendar.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 38
size_tokens: 234
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "14c5239b40889c302557bbb0fb787eefc8b6b920d5cdd055749d5be04593a196"
---

## Purpose

The calendar-events surface: `getCalendarEvents(from, to)` and `getCalendarEvent(event)` with mock/real switches (mock mode filters/looks up `mockCalendarEvents`), plus a pure pass-through re-export of the calendar-BLOCK CRUD (`addCalendarBlock`, `getCalendarBlock`, `editCalendarBlock`, `deleteCalendarBlock`, `rescheduleCalendarBlock`) straight from `@levelup/api/src/resources/calendar` with no wrapping at all — those five have no mock branch and no web-specific logic.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `frontend/apps/web/src/data/mockData.ts`: `mockCalendarEvents` for the demo-mode payload.
- `@levelup/api/src/resources/calendar` (outside scope): `calendarApi.getCalendarEvents`/`getCalendarEvent`, and re-exports the calendar-block CRUD directly.

Used by: no file within this scope (its consumer is the calendar page, outside `api/`/`hooks/`/`data/`).
