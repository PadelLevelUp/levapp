---
path: backend/padel_app/tests/conftest.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 3
size_lines: 69
size_tokens: 340
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "53f5578ec555a240a2226d27ab3468c1b2779cae5b31b485744797702efce063"
---

## Purpose

Shared pytest fixtures for the whole `backend/padel_app/tests/` suite: a
fresh Flask `app` per test backed by a throwaway SQLite file, a Flask
`test_client`, a CLI `runner`, two seeded `User` rows, and a small
`AuthActions` helper for the cookie/session login flow. Every test file in
the suite that takes `app` or `client` as a fixture argument resolves it
here via pytest's autodiscovery — no test file imports this module
directly.

## Main players

- `app()` fixture (lines 11-30) — critical. Creates a Flask app via
  `create_app` with `TESTING=True` and a per-test SQLite file
  (`tempfile.mkstemp()`), calls `init_db(app)` and `db.create_all()` inside
  an app context, yields the app, then closes and unlinks the temp DB file
  on teardown. This is why the suite is isolated test-to-test: each test
  gets its own SQLite file, not a shared Postgres schema.
- `client(app)` fixture (lines 33-35) — critical. `app.test_client()`, the
  handle most tests use to hit routes directly (`client.get(...)`,
  `client.post(...)`).
- `runner(app)` fixture (lines 38-40) — supporting. `app.test_cli_runner()`
  for testing Flask CLI commands; rarely used outside CLI-specific tests.
- `seed_users(app)` fixture (lines 43-50) — supporting. Creates two `User`
  rows ("test"/"secret", "other"/"secret2") for tests that want a couple of
  pre-existing accounts without hand-rolling them.
- `AuthActions` class + `auth(client)` fixture (lines 53-68) — supporting.
  Wraps `POST /auth/login` and `GET /auth/logout` for the older
  session/cookie-based auth flow. Most of this scope's tests instead mint a
  JWT directly with `flask_jwt_extended.create_access_token` and build an
  `Authorization: Bearer` header by hand (see the `_auth_header` helper
  pattern repeated across many test files) rather than going through
  `auth.login()`.

## Insights

- The test DB is SQLite, not Postgres — this scope's tests must avoid
  Postgres-only SQL/types; nothing in the read files does, but it is why
  fixture setup never touches migrations.
- Model imports for fixtures live INSIDE the fixture/test bodies
  throughout this suite (e.g. `from padel_app.models import User` inside
  `_seed_history`, `_make_student_user`, etc. in sibling test files), not
  at module top — this file itself only imports `User` at module level,
  but the convention it establishes (import models lazily, after `app` is
  constructed) is followed pervasively downstream, presumably to avoid
  triggering SQLAlchemy model registration before `create_app` has run.
- `AuthActions`/`auth` fixture is legacy relative to the JWT-header pattern
  every other file in this scope hand-rolls; a new test needing
  authentication should follow the `_auth_header(app, user_id)` +
  `create_access_token` pattern seen throughout the scope, not `auth`.

## Connections

- Uses: `padel_app` (`create_app`), `padel_app.models` (`User`),
  `padel_app.sql_db` (`db`, `init_db`).
- Used by: every test module in `backend/padel_app/tests/` — implicitly,
  via pytest fixture injection (`app`, `client`, `runner`, `seed_users`,
  `auth` parameters), not via Python imports.

## Query pointers

- If you need to add a new shared test fixture, add it here rather than
  duplicating setup in each test file — but note most of this scope's
  files already prefer local helper functions (`_seed_*`, `_make_*`) over
  new conftest fixtures for domain-specific seeding.
- If you need to understand JWT auth in tests, read the `_auth_header`
  helper repeated in `test_account_deletion.py`,
  `test_backend_500_fixes.py`, and most other files in this scope instead
  of `AuthActions` here.
