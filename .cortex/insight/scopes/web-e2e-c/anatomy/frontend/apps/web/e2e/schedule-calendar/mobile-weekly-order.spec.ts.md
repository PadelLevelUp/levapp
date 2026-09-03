---
path: frontend/apps/web/e2e/schedule-calendar/mobile-weekly-order.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 153
size_tokens: 1260
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2f332d6f0ca6811edeb50171c50af12c69c78efb82cf098e4bb0d8a92d9a64b8"
---

## Purpose

PAD-27 regression test: under the mobile viewport (<768px, MobileCalendarView),
three classes on the same day rendered in deliberately-wrong order must be
shown sorted by start time in both the weekly column preview (fill-dot
ordering) and the day detail view (CalendarEventCard ordering). Intercepts
`**/app/calendar**` with `page.route` to return three hand-crafted, unsorted
mock events on a fixed future Monday, then asserts `data-event-title` order on
the fill dots and index order on the rendered detail cards.

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- date-fns: `addDays`, `format`, `startOfWeek` to compute a future Monday deterministically

Used by: —

Semantically related (not imports): exercises `MobileCalendarView` (the
component tree that swaps in below `hooks/use-mobile.tsx`'s MOBILE_BREAKPOINT)
and its `[data-testid="day-fill-dot"]` week-strip rendering, distinct from the
desktop CalendarGrid tested by `recurring-class-weekday.spec.ts`.
