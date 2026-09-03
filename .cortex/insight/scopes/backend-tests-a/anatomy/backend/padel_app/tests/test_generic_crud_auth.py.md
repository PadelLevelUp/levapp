---
path: backend/padel_app/tests/test_generic_crud_auth.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 255
size_tokens: 1904
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7c5a042bcae6ec42ba10eead45be199c1d949ff869e0ae553b9209e7c2f7526c"
---

## Purpose

PAD-88 — the generic model-CRUD blueprint (`padel_app/modules/api.py`, the
`/api/...` routes behind the Jinja admin editor) must not be reachable
without administrator credentials. Before PAD-88 it had no
`before_request` guard and no `jwt_required` anywhere, so an anonymous
caller could create/edit/delete/dump/CSV-export every entry of
`padel_app.models.MODELS`. Contract: no credentials -> 401, nothing
written; valid credentials but not admin -> 403, nothing written; admin
(via JWT OR the legacy Flask-Login session) -> the guard lets the request
through. Parametrizes ~15 routes (`create`/`edit`/`delete`/`query`/
`remove_relationship`/`modal_create_page`/`download_csv`/
`upload_csv_to_db`/`image`) for the anonymous-401 case, then specific
tests for: anonymous create/edit leave the DB unchanged; anonymous query
does not leak row data in the response body; an authenticated non-admin
gets 403 (not merely "not 200") on both create and query, with nothing
written; an `is_admin` JWT and an `is_superadmin` JWT both pass the guard
(create + query respectively); and the legacy Flask-Login session path
(used by `/editor`) is exercised via a SEPARATE `session_app`/
`session_client` fixture pair built with a real `SECRET_KEY` and
`SESSION_TYPE` (the shared `conftest.py` `app` fixture has neither, so
cookie sessions can't open there) — admin session passes, non-admin
session gets 403.

## Connections

- Uses: `padel_app.tests.helpers.make_coach`; models `User`, `Season`
  (via `padel_app.models.seasons.Season`), `Club`;
  `flask_jwt_extended.create_access_token`; `padel_app.create_app`,
  `padel_app.sql_db.init_db` (directly, to build the session-enabled
  `session_app` fixture rather than reusing `conftest.py`'s `app`).
- Used by: (none — leaf test file)
- Semantically related (not imports): pins the SAME anonymous/non-owner/
  owner authorization contract as `test_frontend_api_authz.py`, but for
  the generic admin-CRUD blueprint (`/api`) rather than the coach-scoped
  frontend blueprint (`/api/app`) — one is role-gated (admin/superadmin),
  the other is ownership-gated (the caller's own coach data).
