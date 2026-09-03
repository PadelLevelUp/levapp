---
path: frontend/apps/web/e2e/schedule-calendar/recurring-class-weekday.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 78
size_tokens: 868
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7d40b75b7f5e83e59040a64d8a46f027370e73bd3997925c3392bc20ad94d182"
---

## Purpose

PAD-59 regression test: the seeded "E2E Recurring Class" must materialize
under the TUESDAY column of the desktop CalendarGrid, not Monday. The seed
originally stored `daysOfWeek` using Python's `date.weekday()` (Mon=0, Tue=1)
while the app's canonical convention is JS `getDay()` (Sun=0, Mon=1, Tue=2), so
a seeded `1` was misread as Monday. Locates the grid's Monday/Tuesday columns
by index (1 and 2, after the time-gutter column 0), sanity-checks the mapping
against the rendered weekday-abbreviation headers, then asserts the class
renders under Tuesday and NOT under Monday.

## Connections

Uses:
- ../helpers/auth: `loginAsCoach`
- ../helpers/navigation: `openCalendar`
- ../helpers/calendar-navigation: `findClassOnCalendar` (advances weeks to find the first occurrence)

Used by: —

Semantically related (not imports): pins the weekday-index convention shared
by `packages/types/src/domain.ts` and the backend `WEEKDAY_MAP`; the seed's
weekday conversion this test guards lives in `scripts/seed.py` (recurring
lesson block).
