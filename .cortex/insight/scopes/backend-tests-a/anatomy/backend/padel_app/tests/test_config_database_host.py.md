---
path: backend/padel_app/tests/test_config_database_host.py
extracted_at: 2026-09-07T03:58:58Z
extraction_level: 2
size_lines: 248
size_tokens: 2089
centrality: medium
built_at_commit: "7de36cb3b33c39f0b9c3c482154bc27621660c30"
source_sha256: "eb3ffb98e7654c5512ea2c574c2c2801be08c553e80660b84169de4bf220faf2"
---

## Purpose

PAD-95 — regression tests for `padel_app.config`. The base `Config` class
used to interpolate `SQLALCHEMY_DATABASE_URI` inside its own class body,
so subclass overrides of `POSTGRES_HOST` never reached the connection
string: `DevConfig` inherited the base URI verbatim and silently pointed
at production whenever `POSTGRES_HOST` was unset. Pins two properties:
every config class resolves the URI from its OWN host
(`resolve_postgres_host()`/`resolve_database_uri()`, read live via a
`load_config` fixture that reloads `padel_app.config` under a controlled
env), and an unset `POSTGRES_HOST` fails closed to `localhost` rather than
falling through to a production address — for both `Config` and
`DevConfig`. Also pins: `ProdConfig` defaults to the internal
production host; `DevConfigProdDB` is the one explicit production
opt-in and still resolves correctly; an explicit `POSTGRES_HOST` env var
wins for every config class; the URI correctly carries user/password/
port/database; resolution reads the environment AT CALL TIME (not frozen
at import); `get_config_class` selects by `FLASK_ENV`; and the migration
guard (`assert_safe_migration_target`, `is_migration_invocation`) blocks a
production host outside `production` env, allows it in `production` env,
always allows localhost/127.0.0.1, correctly classifies CLI invocations
(`flask db upgrade`/`current` = migration; `flask run`, `gunicorn`,
`pytest` = not), and has an explicit `ALLOW_PRODUCTION_MIGRATIONS=1`
escape hatch. Never opens a real DB connection — only resolved strings are
asserted.

A second block (added for B-016) pins the tunnel distinction the host check
alone cannot make. Postgres is no longer reachable from the internet, so the
shared database is reached through an SSH forward — which makes a REMOTE
database answer on `localhost` and would otherwise silently disarm the PAD-95
guard above. These tests pin the reserved-port marker: `is_production_target`
is true for `localhost`/`127.0.0.1` on port 5434 (int or str) and false on
5432, 5433 and `None`; `assert_safe_migration_target` refuses a tunnelled
target outside production and still allows a genuinely local database on 5432
and 5433; and a known remote host stays a production target at any port. Note
`test_get_config_class_selects_by_flask_env` now has to pass an explicit
`environ={"FLASK_SECRET_KEY": ..., "JWT_SECRET_KEY": ...}` for the production
case — B-003 made `ProdConfig` refuse to construct on dev signing fallbacks.

## Connections

- Uses: `padel_app.config` (module under test, reloaded via
  `importlib.reload` inside the `load_config` fixture to pick up env
  changes); no DB/app fixtures from `conftest.py` — this file is entirely
  environment/import-level.
- Used by: (none — leaf test file)
- Semantically related (not imports): none in this scope (config-layer
  file, most other tests are model/service/route level).
