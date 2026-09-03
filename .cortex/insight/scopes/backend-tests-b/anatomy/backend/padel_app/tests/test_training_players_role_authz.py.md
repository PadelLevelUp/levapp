---
path: backend/padel_app/tests/test_training_players_role_authz.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 297
size_tokens: 2792
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f19c88521376da4b31af9cffae1830afe25fbbbb3392d8eb130cb90c9de45fda"
---

## Purpose

PAD-116 tests, follow-up to PAD-103 (`test_settings_role_authz.py`), for the coach-only Training and Players routes left out of that ticket's scope. The module docstring records what was empirically probed against `main` with a student token BEFORE any change: the nine Training routes (`/exercises*`, `/exercise-groups*`) already correctly 403'd because every service behind them opens with its own `if coach is None: abort(403, ...)` guard — a contract that holds only by each service remembering to check, since the route itself hands a `None` coach straight through. The four Players routes (`/players`, `/coach_players`, `/coach_players_paginated`, `/player_profile/<id>`) had no such service guard and dereferenced the `None` coach directly (`coach.id`, `current_club()`), raising an unhandled `AttributeError` (500) — the real defect this ticket fixes. So this file does two jobs: pins a genuine 500→403 fix for the four Players routes, and pins (via `test_no_converted_route_500s_for_a_student` and the full-matrix `test_every_converted_route_rejects_a_student_with_403`) that the nine already-correct Training routes stay 403 rather than regressing to 500 if a later service refactor removes the ad-hoc guard. Every status check is exact `==`, since the failure mode being fixed IS a 500. Also pins anonymous callers still get 401 (role check doesn't displace the PAD-92 auth check), the coach's own happy paths on all 13 routes are unaffected, and — the negative control — three student-facing routes (`/calendar`, `/dashboard`, `/availability_blockers`) that branch on `current_coach() is None` to serve students must NOT be hardened into 403ing them; there's a matching comment next to `require_coach()` in `frontend_api.py` this test is the executable half of.

## Connections

- Uses: `padel_app.models.User`, `padel_app.models.Player`, `padel_app.models.Association_CoachPlayer`, `padel_app.models.Exercise`, `padel_app.models.ExerciseGroup`, `padel_app.models.coaches.Coach`, `padel_app.models.clubs.Club`, `padel_app.models.Association_CoachClub`, `padel_app.models.Association_CoachExercise`, `padel_app.models.Association_CoachExerciseGroup`, `padel_app.sql_db.db`; `flask_jwt_extended.create_access_token` for auth headers; the `app` and `client` fixtures from `conftest.py` (scope `backend-tests-a`). Exercises the `frontend_api`/`editor_api` blueprint's Training and Players routes (scope `backend-api`), and the `require_coach()`/`current_coach()`/`current_club()` helpers referenced in `frontend_api.py`.
- Used by: —
- Semantically related (not imports): `test_settings_role_authz.py` (the PAD-103 predecessor ticket pinning the identical nullable-`current_coach()`-dereference 500→403 pattern for the Settings blueprint).
