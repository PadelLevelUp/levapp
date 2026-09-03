---
concept: production-migration-guard
extracted_at: 2026-09-03T15:00:00Z
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
---

# Production migration guard (PAD-95)

A fail-closed check that stops a non-production process from running database migrations against a production host. Three known hosts are listed in `padel_app/config.py`'s `PRODUCTION_POSTGRES_HOSTS`: the prod Cloud SQL public IP, the prod Cloud SQL private IP, and the shared dev/staging VM's IP (the latter is also, separately, one of the two origins CORS allows — see the file `backend/padel_app/__init__.py`).

Enforcement has two call sites for the same underlying check (`config.assert_safe_migration_target`, which raises `RuntimeError` unless `FLASK_ENV=production` or `ALLOW_PRODUCTION_MIGRATIONS=1` is explicitly set):

1. `padel_app/__init__.py`'s `create_app`, gated by `is_migration_invocation()` (detects a `flask db …` CLI invocation from `sys.argv`) — this has to run here, before anything else in app startup opens a DB connection, because by the time Alembic's own `env.py` runs, the background scheduler's job store may have already connected to whatever host was configured.
2. `backend/migrations/env.py`'s `guard_migration_target()`, called unconditionally at module import time as a second, redundant check specifically inside the Alembic environment itself.

An unset `POSTGRES_HOST` deliberately resolves to `localhost` (`LOCAL_POSTGRES_HOST`) rather than falling through to any remote default — the fail-closed design extends to configuration, not just to the runtime check.

Evidence: `backend/padel_app/config.py`, `backend/padel_app/__init__.py`, `backend/migrations/env.py`.
