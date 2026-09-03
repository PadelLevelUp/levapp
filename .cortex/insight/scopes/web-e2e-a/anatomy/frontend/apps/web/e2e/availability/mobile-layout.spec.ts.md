---
path: frontend/apps/web/e2e/availability/mobile-layout.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 166
size_tokens: 1597
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e5d66bf45b57cad3da792f114f576434a32bb57a4ab97b79104498d6639edcc1"
---

## Purpose

PAD-119 mobile-viewport regression coverage for the student Availability
page (spec `calendar.student-blockers` rule 13): asserts no horizontal
overflow and that "Add blocker" and blocker-row content stay inside a
375px viewport. Deliberately forces Portuguese — via a routed
`/api/auth/me` rewrite, not Settings — because the seeded users default to
English but pt strings are wider and are where the overflow bug actually
reproduces; measures `<main>`'s `scrollWidth`/`clientWidth` (not
`documentElement`, which never overflows under this app's shell) and real
element geometry rather than `toBeVisible()`, which reports a
horizontally-clipped element as visible.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsStudent`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/calendar/student-blockers.spec.md`
  rule 13; the pt-locale-plus-`<main>`-measurement pattern here is the
  canonical repo instance of "responsive bugs reproduce only in pt and
  must measure `<main>`, not the document".
