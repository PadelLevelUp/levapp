---
path: frontend/apps/web/src/components/calendar/MobileCalendarView.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 229
size_tokens: 2228
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "45b04070a29ed43c871f15aeaaa5756566632256ebc017f25d5f195f414abfdc"
---

## Purpose

The mobile counterpart to `CalendarGrid`/`CalendarHeader`: a split view with a 7-column mini week strip on top (each day showing up to 4 title chips tinted by the class's own colour, ringed via `data-has-holes` when it still has open seats — an earlier iteration used bare dots and lost the titles PAD-27 deliberately restored) and the selected day's full class list (as `CalendarEventCard variant="row"`) below. Auto-selects today when the visible week contains it, else the week's first day; re-selects if the currently-selected day scrolls out of the visible week (e.g. after a week navigation).

## Connections

Uses: `frontend/apps/web/src/components/calendar/CalendarEventCard.tsx` — one per event in the selected day's list, `variant="row"`, `isNext` resolved once for the whole set (gated on the visible week containing today, same rule as `CalendarGrid`). Also `@levelup/config` (`contrastTextOn`, `fadeColor`, `findNextEventId`, `hasOpenSpots`, `resolveEventState`) — the same shared colour/state module `CalendarEventCard` and `CalendarGrid` use.

Used by: no file within this scope imports `MobileCalendarView`; rendered by the calendar page (outside `web-components-a`) as the mobile-breakpoint alternative to `CalendarGrid`+`CalendarHeader`.
