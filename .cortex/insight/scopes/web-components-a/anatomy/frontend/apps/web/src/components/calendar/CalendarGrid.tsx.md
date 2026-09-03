---
path: frontend/apps/web/src/components/calendar/CalendarGrid.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 370
size_tokens: 3620
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "553a90392873f2f746739db8d3c98cab49b1d6b9472e9b8bde3a52d2827766a3"
---

## Purpose

The desktop week-view calendar grid: a time column plus 7 day columns of 30-minute slots, absolutely-positioned `CalendarEventCard`s, and overlapping-event column-splitting via `groupOverlappingEvents`. Implements PAD-106 drag-to-select (mousedown anchors a slot, mousemove extends a highlighted range, mouseup resolves to `onSlotRangeSelect`, with a zero-length drag falling through to the pre-existing `onSlotClick` so single-slot behaviour is unchanged) using `document`-level listeners attached synchronously inside `mousedown` rather than an effect, so a fast press-release can't outrun a React commit. Also implements native HTML5 drag-and-drop for rescheduling: dragging an event card over a day column snaps the drop position to the nearest half-hour and shows a ghost preview before calling `onEventDrop`.

## Connections

Uses: `frontend/apps/web/src/components/calendar/CalendarEventCard.tsx` — one per visible event, absolutely positioned via `getEventStyle`, with `isNext` resolved once for the whole grid (`findNextEventId`, gated on the visible week containing today) and `compact` computed from rendered height/overlap-group size. Also `@levelup/config` (`findNextEventId`), `date-fns` (`format`, `isToday`).

Used by: no file within this scope imports `CalendarGrid`; rendered by the desktop calendar page (outside `web-components-a`) as the week-view counterpart to `MobileCalendarView`.
