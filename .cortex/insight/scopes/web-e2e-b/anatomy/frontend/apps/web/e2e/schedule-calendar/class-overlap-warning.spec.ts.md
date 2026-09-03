---
path: frontend/apps/web/e2e/schedule-calendar/class-overlap-warning.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 113
size_tokens: 963
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "5a514091565feeabc82adfd896d2b526579678bd94c30585edf7ee7fd3fa6061"
---

## Purpose

E2E for PAD-99: creating a class at a time that overlaps an existing event on
the same day must WARN the coach non-blockingly, not silently allow or hard
block. The seeded "E2E Academy Class" sits 10:00–11:00 on the first Monday
after today; because the calendar only loads the currently-visible week
client-side, `beforeEach` navigates forward one week via the shared
`goToNextWeek` helper before either test runs. Test 1: creating a class
10:30–11:30 (overlapping) triggers a "proceed anyway" confirm button plus an
"already ... event ... this time" message; confirming still creates the
class. Test 2: a clearly free 07:00–08:00 slot creates directly with no
overlap dialog at all.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openCalendar`);
  `helpers/calendar-navigation` (`goToNextWeek`). (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises the overlap-detection check in
  `AddClassSheet.tsx` / `lesson_service.py`'s create-class validation; covers
  `.specflow/specs/classes/create.spec.md` (non-blocking overlap warning
  rule).
