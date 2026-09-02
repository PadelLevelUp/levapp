#!/usr/bin/env bash
# Drops, recreates, migrates and seeds the levelup_qa database.
set -e

PGUSER="${POSTGRES_USER:-padel_app_user}"
PGPORT="${POSTGRES_PORT:-5432}"
PGHOST="${POSTGRES_HOST:-localhost}"
PGPASSWORD="${POSTGRES_PW:-}"
export PGPASSWORD
DB_NAME="levelup_qa"
BACKEND_DIR="$(cd "$(dirname "$0")/../../levelup_backend" && pwd)"
SEED_SCRIPT="$(cd "$(dirname "$0")/../../levelup_frontend/apps/web/e2e/scripts" && pwd)/seed.py"

echo "[reset-qa-db] Dropping $DB_NAME…"
# Terminate all existing connections first (e.g. from a previous Flask/scheduler run)
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
  > /dev/null 2>&1 || true
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
echo "[reset-qa-db] Creating $DB_NAME…"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" postgres -c "CREATE DATABASE $DB_NAME;"

echo "[reset-qa-db] Running migrations…"
cd "$BACKEND_DIR"
# Activate the backend virtual environment
source "$BACKEND_DIR/.venv/bin/activate"

POSTGRES_DB="$DB_NAME" \
POSTGRES_HOST="$PGHOST" \
POSTGRES_PORT="$PGPORT" \
POSTGRES_USER="$PGUSER" \
POSTGRES_PW="${POSTGRES_PW:-}" \
FLASK_APP="padel_app" \
FLASK_ENV="development" \
flask db upgrade

echo "[reset-qa-db] Seeding data…"
POSTGRES_DB="$DB_NAME" \
POSTGRES_HOST="$PGHOST" \
POSTGRES_PORT="$PGPORT" \
POSTGRES_USER="$PGUSER" \
POSTGRES_PW="${POSTGRES_PW:-}" \
FLASK_APP="padel_app" \
FLASK_ENV="development" \
python "$SEED_SCRIPT"

echo "[reset-qa-db] Done."
