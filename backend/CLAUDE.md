# LevelUp Backend

Flask + SQLAlchemy + PostgreSQL API for the LevelUp padel coaching platform.

## Commands

```bash
source .venv/bin/activate
flask run --port 5000                           # Dev server
python -m pytest padel_app/tests/ -v            # All tests
python -m pytest padel_app/tests/test_<name>.py -v  # Specific file
```

## Database

- **Dev**: `padel_app` on Postgres port **5433**, user `padel_app_user`
- **E2E**: `levelup_test` on Postgres port 5432, user `padel_app_user`
- Migrations: Alembic via `flask db upgrade`

> Two Postgres servers run locally and both hold a 47-table LevelUp schema, so the port is what disambiguates them, not the DB name. Port 5433 serves exactly one database — `padel_app` — and that is dev. Port 5432 is the multi-tenant server holding `levelup_test` (E2E), `levelup_qa`, and a stale `levelup` DB owned by `postgres` that is **not** the dev database despite the name. `config.py` defaults to port 5432, so dev runs need `POSTGRES_PORT=5433` from `.env`.

## Testing Patterns

- Fixtures in `tests/conftest.py`: `app` (SQLite test DB), `client`, `seed_users`, `auth`
- `make_coach(app)` from `tests/helpers.py` for creating test coaches
- Import services inside test body (not at module top) to avoid circular imports
- Wrap DB operations in `with app.app_context():`
- Patch external I/O (Redis publish, push notifications) in integration tests
- Use `now=` parameter injection for time-dependent logic (no datetime mocking)
