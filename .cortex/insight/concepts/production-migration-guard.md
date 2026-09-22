A fail-closed check (PAD-95) that stops a non-production process from running database migrations against a production host. Three hosts are listed in `config.py`'s `PRODUCTION_POSTGRES_HOSTS`. Enforcement has two redundant call sites for the same underlying `assert_safe_migration_target` check (which raises unless `FLASK_ENV=production` or `ALLOW_PRODUCTION_MIGRATIONS=1` is explicitly set): `create_app`, gated by `is_migration_invocation()` detecting a `flask db …` CLI call — this has to run before anything else opens a DB connection, because the scheduler's job store may connect first — and `migrations/env.py`'s `guard_migration_target()`, called unconditionally at Alembic import time as a second, independent check. An unset `POSTGRES_HOST` deliberately resolves to `localhost` rather than any remote default.

## Implemented by
`backend/padel_app/config.py`
`backend/padel_app/__init__.py`
`backend/migrations/env.py`

## Related concepts
[[cors-origin-allowlist]]
