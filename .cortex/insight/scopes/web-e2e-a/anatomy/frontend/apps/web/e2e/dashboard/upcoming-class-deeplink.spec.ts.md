---
path: frontend/apps/web/e2e/dashboard/upcoming-class-deeplink.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 134
size_tokens: 1267
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e0a77a8a69fa1895d0fbd86164b488ff486ee713a7bfeb95b9cbc6cf0df32d49"
---

## Purpose

PAD-79 coverage that dashboard "upcoming classes" entries deep-link into
the exact class rather than a bare `/calendar` (spec `dashboard.navigation`
rules 8-10, `calendar.event-detail` rules 10-12). The seeded class always
falls on next Monday — never the calendar's default week — so a correct
click must select that week AND open the class's own detail sheet, with
the deep-link query params consumed exactly once. Asserts the href
contract (`/calendar?classId=...&date=YYYY-MM-DD`) for both the coach's
`schedule_7d` dashboard block and the student's `class_list` block via the
shared `collectClassListItems` flattener.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`, `loginAsStudent`.
  - `helpers/navigation.ts`: `openDashboard`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/dashboard/navigation.spec.md`
  rules 8-10 and `.specflow/specs/calendar/event-detail.spec.md` rules
  10-12; shares the seeded "E2E Academy Class" / next-Monday fixture with
  `dashboard/pending-confirmations.spec.ts` (L3, this scope) and
  `helpers/calendar-navigation.ts`'s `findClassOnCalendar`.
