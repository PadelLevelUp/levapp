#!/usr/bin/env bash
# Drops, recreates, migrates and seeds the levelup_qa database — FROM THE CODE UNDER TEST.
#
# PAD-398 (B-171): the old copy lived under the gitignored docs/ and resolved the backend and
# the seed relative to its own path, so the weekly sweep migrated levelup_qa with the main
# checkout's backend (46 migrations on 2026-09-22) while ~/levapp-qa served staging (84). The
# checkout is now named explicitly and every guard runs before the database is touched.
#
# Usage:  QA_CHECKOUT=~/levapp-qa QA_COMMIT=<sha under test> bash "$QA_CHECKOUT/.claude/skills/weekly-qa/scripts/reset-qa-db.sh"
#         (or pass the checkout as the first argument)
#         QA_RESET_DRY_RUN=1 runs every guard, prints what it resolved, and touches no database.
# Prints `QA_SCHEMA_HEAD=<revision>` last, for the report's `Ran against:` line.
set -euo pipefail

abort() { echo "reset-qa-db ABORT: $*" >&2; exit 2; }

QA_CHECKOUT="${1:-${QA_CHECKOUT:-}}"
[ -n "$QA_CHECKOUT" ] || abort "QA_CHECKOUT is not set — pass the checkout under test (e.g. ~/levapp-qa); nothing is inferred"
QA_CHECKOUT="$(cd "$QA_CHECKOUT" 2>/dev/null && pwd -P)" || abort "QA_CHECKOUT does not exist"
TOP="$(git -C "$QA_CHECKOUT" rev-parse --show-toplevel 2>/dev/null)" || abort "$QA_CHECKOUT is not a git worktree"
[ "$(cd "$TOP" && pwd -P)" = "$QA_CHECKOUT" ] || abort "$QA_CHECKOUT is inside a worktree, not its top ($TOP)"

# Any clean worktree passes the checks below — the main checkout too. The commit is what tells
# the tree under test from a parked one, so it is required.
[ -n "${QA_COMMIT:-}" ] || abort "QA_COMMIT is not set — pass the commit the run tests (step 1's QA_COMMIT)"
HEAD_SHA="$(git -C "$QA_CHECKOUT" rev-parse HEAD)"
case "$HEAD_SHA" in "$QA_COMMIT"*) ;; *) abort "$QA_CHECKOUT is at ${HEAD_SHA:0:9}, not the QA_COMMIT $QA_COMMIT under test";; esac

# The schema and the fixture must be exactly the commit's: no local edits, no stray files.
DIRTY="$(git -C "$QA_CHECKOUT" status --porcelain -- backend/migrations frontend/apps/web/e2e/scripts)"
[ -z "$DIRTY" ] || abort "local changes under migrations/ or the seed in $QA_CHECKOUT:
$DIRTY"
ON_DISK="$(find "$QA_CHECKOUT/backend/migrations/versions" -maxdepth 1 -name '*.py' | wc -l | tr -d ' ')"
IN_COMMIT="$(git -C "$QA_CHECKOUT" ls-tree --name-only HEAD backend/migrations/versions/ | grep -c '\.py$' || true)"
[ "$ON_DISK" = "$IN_COMMIT" ] || abort "$ON_DISK migration files on disk but $IN_COMMIT in ${HEAD_SHA:0:9}"

BACKEND_DIR="$QA_CHECKOUT/backend"
SEED_SCRIPT="$QA_CHECKOUT/frontend/apps/web/e2e/scripts/seed.py"
[ -f "$SEED_SCRIPT" ] || abort "no seed at $SEED_SCRIPT"
[ -x "$BACKEND_DIR/.venv/bin/python" ] || abort "no virtualenv at $BACKEND_DIR/.venv"

# A symlinked venv can import padel_app from another tree; the cwd and PYTHONPATH decide it.
export PYTHONPATH="$BACKEND_DIR"
IMPORTED="$(cd "$BACKEND_DIR" && .venv/bin/python -c 'import os, padel_app; print(os.path.realpath(padel_app.__file__))' 2>/dev/null)" \
  || abort "padel_app does not import from $BACKEND_DIR"
case "$IMPORTED" in "$BACKEND_DIR"/*) ;; *) abort "padel_app imports from $IMPORTED, not from $BACKEND_DIR";; esac

echo "[reset-qa-db] checkout $QA_CHECKOUT @ ${HEAD_SHA:0:9} — $IN_COMMIT migrations, seed $SEED_SCRIPT"
if [ -n "${QA_RESET_DRY_RUN:-}" ]; then
  echo "[reset-qa-db] dry run: every guard passed; no database touched"
  exit 0
fi

PGUSER="${POSTGRES_USER:-padel_app_user}"
PGPORT="${POSTGRES_PORT:-5432}"
PGHOST="${POSTGRES_HOST:-localhost}"
PGPASSWORD="${POSTGRES_PW:-}"
export PGPASSWORD
DB_NAME="levelup_qa"

echo "[reset-qa-db] Dropping $DB_NAME…"
# Terminate existing connections first (e.g. from a previous Flask/scheduler run).
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" postgres -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
  > /dev/null 2>&1 || true
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
echo "[reset-qa-db] Creating $DB_NAME…"
psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" postgres -c "CREATE DATABASE $DB_NAME;"

cd "$BACKEND_DIR"
# shellcheck disable=SC1091
source "$BACKEND_DIR/.venv/bin/activate"
export POSTGRES_DB="$DB_NAME" POSTGRES_HOST="$PGHOST" POSTGRES_PORT="$PGPORT" POSTGRES_USER="$PGUSER" \
  POSTGRES_PW="${POSTGRES_PW:-}" FLASK_APP="padel_app" FLASK_ENV="development"

echo "[reset-qa-db] Running migrations…"
flask db upgrade

# Only the revision ids: the app may log its config line on the same stream.
HEADS="$(flask db heads 2>/dev/null | grep -oE '^[0-9a-f]{6,}' | sort | tr '\n' ' ')"
CURRENT="$(flask db current 2>/dev/null | grep -oE '^[0-9a-f]{6,}' | sort | tr '\n' ' ')"
[ -n "$HEADS" ] && [ "$HEADS" = "$CURRENT" ] || abort "after the upgrade the database is at '$CURRENT', the code's heads are '$HEADS'"

echo "[reset-qa-db] Seeding data…"
python "$SEED_SCRIPT"

echo "[reset-qa-db] Done."
echo "QA_SCHEMA_HEAD=${CURRENT% }"
