---
path: frontend/apps/web/src/components/calendar/EventDetailSheet.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 355
size_tokens: 3093
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8d4c5534b5a4531e8ed6b84f25580e042d18301f6e52ac82fbcd2487a783796c"
---

## Purpose

The detail/edit sheet for a non-class calendar block (personal/break/holiday/off-work) — the `ClassDetailSheet` counterpart for `event.type === 'block'`. Fetches the block via `getCalendarBlock(event.originalId)` on open, offers inline view/edit toggling for type/title/description/date/time/recurrence, and on delete routes a recurring block through `ClassScopeDialog` (mode="delete") for single-vs-future scope, or deletes immediately for a non-recurring one. Simpler than `ClassDetailSheet` — no attendance, no notifications, no participants; only owns the block's own editable fields.

## Connections

Uses: `frontend/apps/web/src/components/calendar/ClassScopeDialog.tsx` — for the recurring-delete scope prompt, and its exported `ApplyScope` type for `confirmDelete`'s parameter.

Used by: no file within this scope imports `EventDetailSheet`; opened from the calendar page (outside `web-components-a`) whenever a `CalendarEventCard` of type `"block"` is clicked.
