#!/usr/bin/env bash
# Creates the levelup_test database if it doesn't exist.
set -e

PGUSER="${POSTGRES_USER:-padel_app_user}"
PGPORT="${POSTGRES_PORT:-5433}"
PGHOST="${POSTGRES_HOST:-localhost}"
DB_NAME="levelup_test"

echo "Creating database $DB_NAME on $PGHOST:$PGPORT…"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -tc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" \
  | grep -q 1 || psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -c "CREATE DATABASE $DB_NAME;"
echo "Database $DB_NAME ready."
