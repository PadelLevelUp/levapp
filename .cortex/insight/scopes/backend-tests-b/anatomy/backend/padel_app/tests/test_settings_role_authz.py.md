---
path: backend/padel_app/tests/test_settings_role_authz.py
extracted_at: 2026-09-03T13:59:54Z
extraction_level: 2
size_lines: 413
size_tokens: 3726
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "4f634dfac22dc19282fc2449269042665944199ace3c4cad43a04a3ad006be8a"
---

## Purpose

PAD-103 tests pinning that the coach-only Settings surface rejects a *student* caller (a `Player` row with no `Coach` row) with a deliberate 403, not an unhandled `AttributeError`/500. Hiding sections in the web UI was cosmetic — `/settings` was reachable by URL for every authenticated user, and the endpoints behind coach-only panels resolved the acting coach via nullable `current_coach()`, which the route then dereferenced for a student, producing a 500. PAD-92 had already hardened the same blueprint against anonymous and other-coach callers; this file pins the third axis, the wrong-role caller. Every status assertion is exact (`==`, never `!= 200`) since the pre-fix failure mode WAS already non-2xx (a 500), so a loose check would pass against unfixed code. Parametrized matrices cover coach-only READS (`/api/app/coach_levels`, `/evaluation_categories`, `/seasons`, `/coach`, `/import/history`, `/club/{id}/coach-invitations`) and WRITES (add/delete coach_level, evaluation_category, season; import confirm/confirm-stream/revert; create/revoke coach invitation) — all must 403 for a student, and writes must be provably pure (nothing created/deleted, counts unchanged). A separate multipart case (`/import/analyze`) checks the guard fires before the uploaded bytes are even read. `/api/app/notify/*` routes (already hardened via their own `_current_coach()`) are audited to stay 403/404/405. Regression guards confirm the coach is unaffected (still 200/writes succeed) and that per-user routes on the `users` row (`/api/auth/me` profile+language) and the one student-scoped surface (`/api/app/availability_blockers`, guarded by `_require_student`) are NOT swept up by the coach-only hardening.

## Connections

- Uses: `padel_app.models.User`, `padel_app.models.Player`, `padel_app.models.Association_CoachPlayer`, `padel_app.models.CoachLevel`, `padel_app.models.EvaluationCategory`, `padel_app.models.Season`, `padel_app.models.coaches.Coach`, `padel_app.models.clubs.Club`, `padel_app.models.Association_CoachClub`, `padel_app.sql_db.db`; `flask_jwt_extended.create_access_token` for auth headers; the `app` and `client` fixtures from `conftest.py` (scope `backend-tests-a`). Exercises the `frontend_api`/`notification_engine_api`/`api_auth` blueprint routes (scope `backend-api`) via `client.get`/`post`/`patch`, and indirectly the `require_coach()`/`current_coach()` helpers those routes call into.
- Used by: —
- Semantically related (not imports): `test_training_players_role_authz.py` (direct follow-up ticket, PAD-116, pinning the same `require_coach()`-vs-nullable-`current_coach()` 500→403 pattern for the Training/Players routes that PAD-103 left out of scope); `test_profile_update.py` (covers the `/api/auth/me` per-user route this file asserts must stay unaffected).
