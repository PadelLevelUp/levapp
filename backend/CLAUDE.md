# LevelUp Backend

Flask + SQLAlchemy + PostgreSQL API for the LevelUp padel coaching platform.

## Commands

```bash
source .venv/bin/activate
flask run --port 5000                           # Dev server
python -m pytest padel_app/tests/ -v            # All tests (sqlite, foreign keys ON — the fast path)
python -m pytest padel_app/tests/test_<name>.py -v  # Specific file
LEVAPP_TEST_DB=postgres POSTGRES_PW=… python -m pytest padel_app/tests/   # same suite on Postgres, schema built by the real migrations
```

CI (`.github/workflows/backend-tests.yaml`) runs both backends on every PR into `staging`/`main`
(PAD-278). The Postgres run creates `levelup_pytest_<pid>` on `POSTGRES_HOST:POSTGRES_PORT`
(default localhost:5432, the E2E server) and drops it afterwards; a model column without a
migration, or a second Alembic head, fails there.

## Database

- **Dev**: `padel_app` on Postgres port **5433**, user `padel_app_user`
- **E2E**: `levelup_test` on Postgres port 5432, user `padel_app_user`
- **Shared dev DB on the VM**: port **5434**, reached only through an SSH forward —
  `gcloud compute ssh levelup-instance --zone europe-west1-b -- -N -L 5434:localhost:5432`
  (`.env.dev`). Postgres is not exposed to the internet (B-016), and 5434 is reserved so
  the PAD-95 migration guard can still tell a tunnelled remote database from a local one.
- Migrations: Alembic via `flask db upgrade`

> Two Postgres servers run locally and both hold a 47-table LevelUp schema, so the port is what disambiguates them, not the DB name. Port 5433 serves exactly one database — `padel_app` — and that is dev. Port 5432 is the multi-tenant server holding `levelup_test` (E2E), `levelup_qa`, and a stale `levelup` DB owned by `postgres` that is **not** the dev database despite the name. `config.py` defaults to port 5432, so dev runs need `POSTGRES_PORT=5433` from `.env`.

## Testing Patterns

- Fixtures in `tests/conftest.py`: `app` (SQLite with FK enforcement, or Postgres via `LEVAPP_TEST_DB=postgres`), `client`, `seed_users`, `auth` — never branch a test on the backend (compass R-026)
- `make_coach(app)` from `tests/helpers.py` for creating test coaches
- Import services inside test body (not at module top) to avoid circular imports
- Wrap DB operations in `with app.app_context():`
- Patch external I/O (Redis publish, push notifications) in integration tests
- Use `now=` parameter injection for time-dependent logic (no datetime mocking)
