---
path: backend/padel_app/tests/test_backend_500_fixes.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 183
size_tokens: 1399
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "56ce5c98c1f51efb72f22c6bb02f2fadfe686c9c827f8948892cf5d6a6eaa965"
---

## Purpose

Regression tests for two 500s found during an automated E2E test-health
sweep. Bug 1: `GET`/`POST` on `/api/app/exercises` and
`/api/app/exercise-groups` threw `AttributeError` for any authenticated
non-coach caller (e.g. a student) because `training_service.py`
dereferenced `coach.id` without a None-check — pinned as 403 (not 500) for
both the read and write paths, and re-verified 200 for an actual coach.
Bug 2: `GET /api/editor/tokenblocklist/schema` threw `AttributeError`
because `TokenBlocklist` is a plain `db.Model` (no editor `Model` mixin)
but was registered in `padel_app.models.MODELS`, so the generic editor's
`get_create_form()` call blew up — pinned as: `tokenblocklist` must be
absent from `MODELS` entirely, the schema endpoint returns 404 (not 500)
for it, and a real registered model's schema endpoint (`club`) still
returns 200.

## Connections

- Uses: `padel_app.tests.helpers` (`make_coach`) for the coach-happy-path
  cases; `padel_app.models` (`MODELS`), `padel_app.models.coaches.Coach`,
  `padel_app.models.players.Player`, `padel_app.models.User`;
  `flask_jwt_extended.create_access_token` for auth headers.
- Used by: (none — leaf test file)
- Semantically related (not imports): shares the "never 500, fail with the
  right status code" theme with `test_delete_nonnumeric_id_guard.py` and
  `test_generic_crud_auth.py` (also exercises the generic editor/CRUD
  authorization layer).
