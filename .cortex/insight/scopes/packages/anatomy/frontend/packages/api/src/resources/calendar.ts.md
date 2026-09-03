---
path: frontend/packages/api/src/resources/calendar.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 54
size_tokens: 384
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c30d0daaf09cc87450242630b14603663c10d0d814bbd170b3719fe0a37e690f"
---

## Purpose

CRUD and reschedule for calendar blocks (non-class busy/unavailable events, with `'single' | 'future'` scope for recurring ones), plus the main calendar-events read (`getCalendarEvents`) and single-event lookup (`getCalendarEvent`) that populate the week/day grid on both platforms. `addCalendarBlock`/`getCalendarBlock`/`editCalendarBlock` are untyped (`any`), unlike most sibling resource modules.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/add_event`, `/app/calendar_block/:id`, `/app/reschedule_block/:id`, `/app/calendar`, `/app/calendar_event`.
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `CalendarEvent`.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `calendarApi`.
- `frontend/packages/hooks/src/queries.ts`: `useCalendarEvents` wraps `getCalendarEvents`.
