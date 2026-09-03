---
path: frontend/apps/web/e2e/security/training-players-role-authz.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 235
size_tokens: 1937
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "52fb4be0d80589082cf11f7577e6c3e792abc8c820834ef4f9b8b41023e5b1e3"
---

## Purpose

PAD-116 regression test: coach-only Training and Players endpoints must
answer a student caller with a deliberate 403, never a 500. Follow-up to
PAD-103 (Settings) and sibling to PAD-92's spec in this folder. Notably
documents that although the ticket claimed 13 routes 500'd, measured against
`main` only 4 actually did (`/players`, `/coach_players`,
`/coach_players_paginated`, `/player_profile`) — the other 9
exercise/exercise-group routes already returned 403 only because every
service behind them independently guards `if coach is None`, an accidental
contract this spec now pins explicitly so a later service refactor can't
silently regress them to 500. Runs against real Postgres (not the unit
suite's SQLite) because `/players` also dereferences `current_club()`, a
second null-coach path only the route-level guard now short-circuits.
Asserts exact status codes (`toBe`, never "not 200") since the failure mode
being fixed IS a 500. Also asserts three student-facing routes
(`/calendar`, `/dashboard`, `/availability_blockers`) are deliberately NOT
hardened, that a coach loses no access, and that role-checking never displaces
the auth check (anonymous still gets 401, not 403).

## Connections

Uses:
- ../helpers/auth: `COACH_USERNAME`/`COACH_PASSWORD`, `STUDENT_USERNAME`/`STUDENT_PASSWORD`
- ../helpers/api: `API_APP`, `API_AUTH`

Used by: —

Semantically related (not imports): the exhaustive endpoint matrix's backend
counterpart is `padel_app/tests/test_settings_role_authz.py` (also cited by
`settings/student-settings-scope.spec.ts`); specs: players.list rule 7,
players.profile rule 7, training.exercises rule 9, training.groups rule 6.
