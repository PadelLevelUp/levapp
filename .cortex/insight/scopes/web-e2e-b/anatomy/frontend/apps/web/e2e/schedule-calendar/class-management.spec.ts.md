---
path: frontend/apps/web/e2e/schedule-calendar/class-management.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 81
size_tokens: 831
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d5b77741542913e2d7c12ac778aff4ef0e43de95cb71ca9b01ee71624c0e9eda"
---

## Purpose

Baseline class-management smoke coverage (US-40/41/42/43): the "Add class"
toolbar button opens a sheet with the expected name-field placeholder;
clicking the seeded "E2E Academy Class" opens its detail dialog showing
participants/attendance/edit content; a delete-or-cancel affordance exists in
the detail sheet (accepts either "Delete class" or "Cancel class/session"
naming, whichever the UI currently uses); and an edit/update button exists in
the dialog. Broader but shallower than the dedicated
`class-delete-confirm.spec.ts` / `class-deletion.spec.ts` / PAD-99 overlap
tests in this directory, which assert the actual mechanics rather than just
presence.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openCalendar`);
  `helpers/calendar-navigation` (`findClassOnCalendar`). (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises `AddClassSheet.tsx` and
  `ClassDetailSheet.tsx`'s top-level affordances; covers
  `.specflow/specs/classes/create.spec.md`,
  `.specflow/specs/classes/edit.spec.md`, and
  `.specflow/specs/classes/delete.spec.md` at smoke depth.
