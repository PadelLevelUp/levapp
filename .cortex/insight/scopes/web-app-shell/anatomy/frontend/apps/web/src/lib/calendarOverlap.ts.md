---
path: frontend/apps/web/src/lib/calendarOverlap.ts
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 58
size_tokens: 467
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3f15016d66a39c170b34a9c4de416e8fb70baaac7a17b062333bd255043c8058"
---

## Purpose

PAD-99: `findOverlappingEvent(candidate, events, excludeId?)` finds the first existing `CalendarEvent` whose half-open `[start, end)` time interval on the same day intersects a candidate slot's interval, so the calendar UI can warn about scheduling conflicts. Half-open intervals mean back-to-back events (one ending exactly when the next starts) are correctly NOT flagged as overlapping. `excludeId` lets an event being edited skip comparing against itself. Exports the helper `toMinutes` and the `OverlapCandidate` interface.

## Connections

Uses: `@/types` (`CalendarEvent` type, outside this scope).

Used by: not resolved within this scope's import graph (no `edges_within_scope` or `edges_crossing_scope` entry names a consumer); the evident intended consumer is calendar-editing UI under `@/components/calendar/*` (outside this scope, e.g. `AddClassSheet`/`AddEventSheet`/`ClassDetailSheet` referenced from `CalendarPage.tsx`) — not confirmed by a resolved import in this slice.
