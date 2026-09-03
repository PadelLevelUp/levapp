---
path: frontend/apps/web/e2e/auth-onboarding/login.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 42
size_tokens: 468
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ab38d8e055e4d9b03f36abe7e75abc104ae789173a285c4d949ecd95d2708695"
---

## Purpose

US-33/US-34 baseline login coverage — coach and student can log in with
valid credentials, a wrong password shows an inline error and keeps the
user on `/auth`, and an unauthenticated visitor hitting a protected route
is redirected to `/auth`. The smallest, most foundational spec in the
suite.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`, `loginAsStudent`, `COACH_USERNAME`,
    `COACH_PASSWORD`.
- Used by: — (leaf spec file)
- Semantically related (not imports): covers
  `.specflow/specs/auth/login.spec.md`; every other spec in the suite
  depends transitively on the login flow this file directly tests.
