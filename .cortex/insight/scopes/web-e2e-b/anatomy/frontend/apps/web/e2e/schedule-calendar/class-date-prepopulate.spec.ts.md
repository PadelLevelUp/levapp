---
path: frontend/apps/web/e2e/schedule-calendar/class-date-prepopulate.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 98
size_tokens: 1001
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "85701366a4658527032b82a9279a9cb5c8f7bd288922774393f2a949970eadda"
---

## Purpose

E2E for PAD-25: clicking a date affordance to open the "Add class" sheet must
pre-populate the sheet's date field with the clicked day, across three entry
points. Test 1: the toolbar "Add class" button (no specific day clicked) uses
today's date. Test 2: clicking a specific half-hour time slot in the desktop
week grid (structural locator into the CSS-grid column for a given weekday)
pre-fills that day's date. Test 3: on a 390x844 mobile viewport, tapping a day
button (e.g. "Wed 12") THEN "Add class" (the icon-only toolbar's last button)
uses that tapped day — computed independently via `date-fns` `nextMonday` +
`addDays` rather than hardcoded, so it survives any calendar week the suite
runs in.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openCalendar`);
  `date-fns` (`format`, `addDays`, `nextMonday`) — external date-math library,
  not a scope helper. (Auth/navigation helpers live in scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises
  `frontend/apps/web/src/components/calendar/AddClassSheet.tsx`'s date
  pre-fill logic and `CalendarGrid.tsx`'s slot-click handler; covers
  `.specflow/specs/calendar/slot-click.spec.md` and
  `.specflow/specs/classes/create.spec.md`.
