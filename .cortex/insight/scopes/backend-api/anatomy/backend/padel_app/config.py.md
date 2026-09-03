---
path: backend/padel_app/config.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 183
size_tokens: 1618
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6c3b594bf7a8937d7466f45da30ab29adb1fe547d88fa0c6a33ff2c4a87adbca"
---

## Purpose

Environment-driven Flask config classes (`Config` base, `DevConfig`, `DevConfigProdDB`, `ProdConfig`) plus the PAD-95 production-database migration guard. `PRODUCTION_POSTGRES_HOSTS` lists known real-data hosts (prod Cloud SQL public/private IPs, the shared dev/staging VM); `is_migration_invocation` detects a `flask db …` CLI invocation from `sys.argv`; `assert_safe_migration_target` raises `RuntimeError` if that invocation's resolved host is a production host while `FLASK_ENV != "production"`, unless `ALLOW_PRODUCTION_MIGRATIONS=1` is explicitly set — this must run inside `create_app` itself (not inside Alembic's `env.py`) because by the time Alembic runs, the scheduler's job store has already opened a connection to whatever host was configured. Each `Config` subclass sets its own `DEFAULT_POSTGRES_HOST` (`localhost` for dev, the prod private IP for `ProdConfig`, the prod public IP for the explicit opt-in `DevConfigProdDB`); `__init_subclass__` and the module-level `Config.refresh_database_settings()` call recompute the resolved `POSTGRES_*` values and `SQLALCHEMY_DATABASE_URI` as real class attributes (needed because `Flask.config.from_object` only copies plain uppercase attributes, not descriptors) — the docstring explains the URI is built per-class rather than interpolated in the base class body so a subclass's host override actually takes effect. As written, `SECRET_KEY` and `JWT_SECRET_KEY` fall back to hardcoded dev values (`"dev-secret-key"`, `"dev-jwt-secret"`) via `os.getenv(..., default)` if the corresponding environment variable is unset; the deploy path injects `FLASK_SECRET_KEY` (not `SECRET_KEY`) — this file does not read that variable. `JWT_TOKEN_LOCATION` includes both `"headers"` and `"query_string"` (query param name `"token"`), and `JWT_ACCESS_TOKEN_EXPIRES` is 30 days.

## Connections

- Uses: stdlib only (`os`, `sys`, `logging`, `datetime.timedelta`)
- Used by: `padel_app/__init__.py`: `create_app` calls `get_config_class(env)`, `config_cls.refresh_database_settings()`, and — when the process is a migration invocation — `is_migration_invocation()`/`assert_safe_migration_target()`
