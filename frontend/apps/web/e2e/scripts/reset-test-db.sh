#!/usr/bin/env bash
# Drops, recreates, migrates and seeds the levelup_test database.
set -e

PGUSER="${POSTGRES_USER:-padel_app_user}"
PGPORT="${POSTGRES_PORT:-5432}"
PGHOST="${POSTGRES_HOST:-localhost}"
PGPASSWORD="${POSTGRES_PW:-}"
export PGPASSWORD
# Overridable so a worktree/second session can use its own database instead of
# resetting the shared one under another running suite (see playwright.config.ts).
DB_NAME="${E2E_DB_NAME:-levelup_test}"
BACKEND_DIR="$(cd "$(dirname "$0")/../../../../../backend" && pwd)"
SEED_SCRIPT="$(cd "$(dirname "$0")" && pwd)/seed.py"

# PAD-218 guards, for a BARE run of this script (npm run test:e2e:reset). They
# sit BEFORE pg_terminate_backend on purpose — terminating a peer's connections
# is already the damage, even if the DROP were then refused. Playwright's
# global-setup does its own lock check first and sets E2E_RESET_FROM_PLAYWRIGHT
# so these do not trip on the run's own backend (Playwright starts the
# webServers before global-setup runs).
if [ "${E2E_RESET_FROM_PLAYWRIGHT:-}" != "1" ]; then
  # 1. A live Playwright run holds this database (lock written by global-setup,
  #    live only while its pid is).
  LOCK_FILE="${TMPDIR:-/tmp}/levapp-e2e-${DB_NAME}.lock"
  if [ -f "$LOCK_FILE" ]; then
    LOCK_PID="$(sed -n 's/.*"pid":\([0-9]*\).*/\1/p' "$LOCK_FILE")"
    if [ -n "$LOCK_PID" ] && kill -0 "$LOCK_PID" 2>/dev/null; then
      echo "[reset-db] REFUSING to reset $DB_NAME: a Playwright run holds it (pid $LOCK_PID, $LOCK_FILE)." >&2
      exit 2
    fi
  fi
  # 2. The SHARED database while a backend is serving it on 5001. A bare reset
  #    has no backend of its own, so a listener there is somebody else's run.
  #    E2E_GUARD_PORT exists so this can be exercised against a scratch listener.
  GUARD_PORT="${E2E_GUARD_PORT:-5001}"
  if [ "$DB_NAME" = "levelup_test" ]; then
    HOLDER="$(lsof -nP -iTCP:"$GUARD_PORT" -sTCP:LISTEN 2>/dev/null | tail -n +2)"
    if [ -n "$HOLDER" ]; then
      echo "[reset-db] REFUSING to reset $DB_NAME: something is listening on :$GUARD_PORT —" >&2
      echo "$HOLDER" >&2
      echo "[reset-db] Another session's E2E run is probably live. Use a per-checkout database" >&2
      echo "[reset-db] (run 'npx playwright test' without E2E_SHARED) or wait for it to finish." >&2
      exit 2
    fi
  fi
fi

echo "[reset-db] Dropping $DB_NAME…"
# Terminate all existing connections first (e.g. from a previous Flask/scheduler run)
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
  > /dev/null 2>&1 || true
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
echo "[reset-db] Creating $DB_NAME…"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" postgres -c "CREATE DATABASE $DB_NAME;"

echo "[reset-db] Running migrations…"
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

echo "[reset-db] Seeding data…"
POSTGRES_DB="$DB_NAME" \
POSTGRES_HOST="$PGHOST" \
POSTGRES_PORT="$PGPORT" \
POSTGRES_USER="$PGUSER" \
POSTGRES_PW="${POSTGRES_PW:-}" \
FLASK_APP="padel_app" \
FLASK_ENV="development" \
python "$SEED_SCRIPT"

echo "[reset-db] Done."
