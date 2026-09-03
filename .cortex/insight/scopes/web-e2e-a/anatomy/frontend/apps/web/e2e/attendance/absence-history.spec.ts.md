---
path: frontend/apps/web/e2e/attendance/absence-history.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 335
size_tokens: 3189
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "795aba4f95e336e8efba07f80b2b6c5ff01a97463a44916433e8e6da9240e7c4"
---

## Purpose

PAD-141 E2E coverage for the "Faltas"/absence-history sub-page (spec
`attendance.absences`), covering both entry points — `/absences` (the
signed-in student's own absences) and `/players/:playerId/absences` (a
coach viewing a roster player). Pins three properties that could not pass
by accident rather than mere presence: the page total must agree with the
dashboard "Missed" KPI, the absences and attendance endpoints must return
disjoint class sets (so neither can be silently reading the other's data),
and the recharts bar chart must draw bars with nonzero height (the
PAD-114 zero-height-bar regression). Also asserts HTTP-layer authorization
(401/403), since PAD-88/PAD-115 established that a route guard alone
doesn't protect the underlying endpoint.

## Connections

- Uses:
  - `helpers/api.ts`: `API_ROOT` to build the `absence_history` endpoint under test.
  - `helpers/auth.ts`: `COACH_USERNAME`/`COACH_PASSWORD`, `COACH_NOLEVELS_USERNAME`/`COACH_NOLEVELS_PASSWORD`, `STUDENT_USERNAME`/`STUDENT_PASSWORD`, `loginAsCoach`, `loginAsStudent`.
- Used by: — (leaf spec file, no in-scope importers)
- Semantically related (not imports): exercises the `/api/app/absence_history`
  backend endpoint and `.specflow/specs/attendance/absences.spec.md`; mirrors
  `attendance/attendance-history.spec.ts`'s page structure and PAD-114 precedent.
