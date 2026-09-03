---
path: frontend/apps/web/e2e/calendar/season-end-no-season.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 88
size_tokens: 782
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "802ab8b192a710dd6becadce892e23bb177703317c9d32765b43ec84391e2198"
---

## Purpose

PAD-90 regression test: creating a class set to "recurs until season end"
when no season covers the class's start date must be rejected with an
inline error, rather than silently leaving `recurrence_end` NULL — which
every downstream reader treats as "recurs forever". The AddClassSheet must
stay open with the reason shown, and picking an explicit end date instead
must clear the blocker and let the create through. Targets a start date
two years out on purpose, so no season created by another spec in the
shared seed DB can accidentally cover it.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`.
  - `helpers/navigation.ts`: `openCalendar`.
- Used by: — (leaf spec file)
- Semantically related (not imports): calendar season/recurrence handling,
  most likely `.specflow/specs/calendar/seasons.spec.md`.
