---
path: backend/padel_app/tests/test_config_database_host.py
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 204
size_tokens: 1643
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "4b9ed84b05dbed39ae4c1b509a746876702456bbc0c26ebbfaec560c7844c8a0"
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

## Connections

- Uses: `padel_app.config` (module under test, reloaded via
  `importlib.reload` inside the `load_config` fixture to pick up env
  changes); no DB/app fixtures from `conftest.py` — this file is entirely
  environment/import-level.
- Used by: (none — leaf test file)
- Semantically related (not imports): none in this scope (config-layer
  file, most other tests are model/service/route level).
