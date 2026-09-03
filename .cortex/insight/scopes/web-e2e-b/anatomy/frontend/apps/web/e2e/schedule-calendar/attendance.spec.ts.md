---
path: frontend/apps/web/e2e/schedule-calendar/attendance.spec.ts
extracted_at: 2026-09-03T15:30:00Z
extraction_level: 2
size_lines: 22
size_tokens: 210
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "37e701cd500d3a5f0b7ffca62080da6a7764e7b8cb27bef63b52623d9cb15910"
---

## Purpose

The original, minimal (US-20) attendance smoke test: opens the seeded "E2E
Academy Class" detail sheet and asserts the roster shows "E2E Student".
VIEW-only — it does not mark or save any attendance, which is explicitly
called out in `attendance-save.spec.ts`'s header comment as the reason the
PAD-64 recurring-class save bug shipped uncaught by this file.

## Connections

- Uses: `helpers/auth` (`loginAsCoach`); `helpers/navigation` (`openCalendar`);
  `helpers/calendar-navigation` (`findClassOnCalendar`). (Scope `web-e2e-a`.)
- Used by: — (Playwright entry point)
- Semantically related (not imports): exercises `ClassDetailSheet.tsx`'s
  roster display; covers `.specflow/specs/attendance/presence.spec.md`.
  Superseded in coverage depth (but not replaced) by
  `attendance-save.spec.ts` in this scope.
