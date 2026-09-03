---
path: frontend/apps/web/e2e/attendance/presences-validation.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 189
size_tokens: 1792
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "432e60f25df587cc6832e6b595e68629a117e170ead1437221be09ed0ec3816c"
---

## Purpose

PAD-140 E2E coverage of the coach-facing "Presenças" validation tab (spec
`attendance.validation`): a coach reviews already-ended classes and
finalizes attendance, driven by two states — every enrolled player
answered ("ready to confirm") vs. at least one silent player ("needs your
input", Validate disabled until decided). Also asserts the presence
endpoints are coach-only, and that guest detection is not naively derived
from the `invited` flag (every enrolled player is `invited=True` at
materialization, so a naive rule would misreport the whole roster as
guests).

## Connections

- Uses:
  - `helpers/api.ts`: `API_APP`, `API_AUTH`.
  - `helpers/auth.ts`: `COACH_USERNAME`/`COACH_PASSWORD`,
    `STUDENT_USERNAME`/`STUDENT_PASSWORD`, `loginAsCoach`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `/api/app/presence_stats`,
  `/presence_trend`, `/class_instances/pending_validation` endpoints;
  `.specflow/specs/attendance/validation.spec.md`; its "E2E Validation
  Class" fixture is deliberately placed in the PREVIOUS week to avoid
  perturbing `schedule-calendar/participant-count-effective.spec.ts`
  (sibling scope).
