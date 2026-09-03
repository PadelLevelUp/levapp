---
path: backend/migrations/env.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 129
size_tokens: 947
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "09ccf68f788cbc0183832a94636c428435c55690df1fa4d249ad273c641c1587"
---

## Purpose

Standard Flask-Migrate/Alembic `env.py`, extended with the PAD-95 production-migration guard: `guard_migration_target()` resolves the Alembic-bound engine's host and calls `padel_app.config.assert_safe_migration_target(host)`, and is invoked unconditionally at module import time (line 48) — before `sqlalchemy.url` is even set on the Alembic config — so a `flask db upgrade`/`flask db migrate` run against a production host without `FLASK_ENV=production` (or `ALLOW_PRODUCTION_MIGRATIONS=1`) fails before any connection is made for migration purposes. Otherwise standard: `get_engine`/`get_engine_url` handle both Flask-SQLAlchemy <3 and >=3 extension shapes, `get_metadata` handles both single- and multi-bind metadata, and `run_migrations_offline`/`run_migrations_online` are the template Alembic entry points, with `run_migrations_online` installing a `process_revision_directives` callback that suppresses no-op autogenerate revisions.

## Connections

- Uses: `alembic.context`; `flask.current_app` (relies on being run inside an app context that already has `flask_migrate` initialized); `padel_app.config.assert_safe_migration_target`, imported lazily inside `guard_migration_target`
- Used by: invoked by Alembic itself (`flask db migrate`/`flask db upgrade`/etc.) as the migration environment script — not imported by any other in-scope Python module
