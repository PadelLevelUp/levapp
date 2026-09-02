# QA Database Infrastructure

Isolated-DB tooling for the weekly QA routine. This gives QA its own PostgreSQL
database (`levelup_qa`) and its own backend port (5002), so QA never collides
with local dev (`levelup` DB / port 5000) or E2E tests (`levelup_test` DB / port 5001).

## `reset-qa-db.sh`

Drops, recreates, migrates, and seeds the `levelup_qa` database. It:

1. Terminates any existing connections to `levelup_qa` (e.g. a leftover Flask/scheduler run).
2. `DROP DATABASE IF EXISTS levelup_qa` then `CREATE DATABASE levelup_qa`.
3. `cd` into `levelup_backend`, activates its `.venv`, and runs `flask db upgrade`
   against `POSTGRES_DB=levelup_qa`.
4. Runs the shared E2E seed script
   (`levelup_frontend/apps/web/e2e/scripts/seed.py`) against `POSTGRES_DB=levelup_qa`.

It is a faithful clone of the E2E `reset-test-db.sh`, differing only in the target
DB name and its path resolution for the new `qa/scripts/` location.

Connection conventions (identical to the E2E script), overridable via env:

- `POSTGRES_HOST` (default `localhost`)
- `POSTGRES_PORT` (default `5432`)
- `POSTGRES_USER` (default `padel_app_user`)
- `POSTGRES_PW`   (required — provided by `.claude/secrets.env`)

### Run it

From `qa/scripts/`:

```bash
source ../../.claude/secrets.env   # provides POSTGRES_PW
./reset-qa-db.sh
```

## Boot the QA backend

QA uses **port 5002** (dev is 5000, E2E is 5001). From `levelup_backend` with the
`.venv` active:

```bash
cd ../../levelup_backend
source .venv/bin/activate
FLASK_ENV=development POSTGRES_DB=levelup_qa flask run --port 5002
```

## Connect the web frontend

Point Vite at the QA backend port. From `levelup_frontend/apps/web`:

```bash
VITE_BACKEND_PORT=5002 npm run dev
```

## Connect the mobile app

Point the Expo app at the QA backend:

```bash
EXPO_PUBLIC_API_URL=http://localhost:5002/api
```
