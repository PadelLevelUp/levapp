---
path: backend/padel_app/cli.py
extracted_at: 2026-09-03T15:00:00Z
extraction_level: 2
size_lines: 159
size_tokens: 1304
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "755b0b9d0a840dd121a8d2892c914bdc08d76037b20b9f4ba2f85b62a8d7eb9c"
---

## Purpose

Registers two Flask CLI commands via `register_cli(app)`. `flask seed` either seeds one or more mock-data tables (`--table`/`--all-mock-data`, delegating to `padel_app.seed.seed_mock_tables`) or, with no table flags, creates a default admin `User` (prompting for a password if `--admin-password`/`ADMIN_PASSWORD` isn't set) and a default `Backend_App` row. `flask db-reset` truncates and restarts identities on some or all tables via raw `TRUNCATE ... RESTART IDENTITY CASCADE` SQL, gated only by a `--yes` flag and a "(DEV ONLY)" docstring — there is no runtime check preventing it from being run against a production database if invoked there.

## Connections

- Uses: `padel_app.sql_db.db`; `werkzeug.security.generate_password_hash`; `click`; lazily imports `padel_app.models` (`Backend_App`, `User`) and `padel_app.seed` (outside this scope) inside the `seed` command body
- Used by: `padel_app/__init__.py`: `create_app` calls `cli.register_cli(app)` during app factory setup, making `seed`/`db-reset` available as `flask seed` / `flask db-reset`
