#!/usr/bin/env bash
# =============================================================================
# LevelUp mobile — Maestro E2E suite runner
#
# Usage:
#   source ../../.claude/secrets.env   # POSTGRES_PW needed for the DB reset
#   bash apps/mobile/scripts/e2e.sh
#
# What it does:
#   1. Verifies the Flask test backend (:5001) is up (fails loudly if not).
#   2. Verifies Metro (:8081) is up — the dev build loads its JS from Metro.
#   3. Verifies the simulator is booted (boots it if needed).
#   4. Kills hung Maestro java processes from previous runs (they break the
#      XCTest driver with "terminate for debugging launch request").
#   5. Resets + seeds the levelup_test database (reset-test-db.sh). Flask is
#      kept RUNNING: the reset terminates its DB connections, but SQLAlchemy's
#      pool reconnects automatically — verified by a healthz check after.
#   6. Runs the Maestro workspace apps/mobile/.maestro — config.yaml pins the
#      numbered execution order (bare folder runs are NOT ordered; some flows
#      are order-dependent, see their headers).
#
# The caller is responsible for starting Flask and Metro (commands below).
# =============================================================================
set -uo pipefail

MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$(cd "$MOBILE_DIR/../.." && pwd)"
SIM_UDID="180A9433-4EA7-4F9B-9FD1-79E1250BD9BB"

export PATH="$HOME/.maestro/bin:$PATH"

fail() { echo "ERROR: $*" >&2; exit 1; }

# ── 1. Flask backend ─────────────────────────────────────────────────────────
FLASK_HEALTH="http://127.0.0.1:5001/api/app/healthz"
if ! curl -sf -m 5 "$FLASK_HEALTH" >/dev/null; then
  cat >&2 <<'EOF'
ERROR: Flask test backend is not responding on :5001.

Start it with (POSTGRES_HOST must NOT come from secrets.env — it points at prod):

  cd <repo-root>/levelup && source .claude/secrets.env && cd levelup_backend && \
  source .venv/bin/activate && \
  FLASK_APP=padel_app FLASK_ENV=development POSTGRES_HOST=localhost \
  POSTGRES_PORT=5432 POSTGRES_USER=padel_app_user POSTGRES_DB=levelup_test \
  JWT_SECRET_KEY=e2e-test-secret E2E_DEBUG_ENDPOINTS=true TEST_MODE=true \
  flask run --host 127.0.0.1 --port 5001 --no-reload
EOF
  exit 1
fi
echo "[e2e] Flask backend healthy."

# ── 2. Metro bundler ─────────────────────────────────────────────────────────
if ! curl -sf -m 5 "http://127.0.0.1:8081/status" >/dev/null; then
  cat >&2 <<EOF
ERROR: Metro is not running on :8081 (the dev build needs it).

Start it with:
  cd $MOBILE_DIR && npx expo start --port 8081
EOF
  exit 1
fi
echo "[e2e] Metro bundler running."

# ── 3. Simulator ─────────────────────────────────────────────────────────────
if ! xcrun simctl list devices | grep "$SIM_UDID" | grep -q "Booted"; then
  echo "[e2e] Booting simulator $SIM_UDID ..."
  xcrun simctl boot "$SIM_UDID" || fail "could not boot simulator $SIM_UDID"
fi
# Block until the boot fully completes — right after a (re)boot the device
# reports "Booted" before CoreSimulator is actually connectable, which makes
# Maestro fail with "device not connected" / driver startup timeouts.
xcrun simctl bootstatus "$SIM_UDID" >/dev/null 2>&1 || true
echo "[e2e] Simulator booted."

# The XCTest driver reinstall can exceed Maestro's default startup timeout on
# a freshly booted simulator.
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-120000}"

# ── 4. Kill hung Maestro java processes ─────────────────────────────────────
HUNG=$(ps aux | grep -i "java" | grep -i "maestro" | grep -v grep | awk '{print $2}' || true)
if [ -n "$HUNG" ]; then
  echo "[e2e] Killing hung Maestro java processes: $HUNG"
  echo "$HUNG" | xargs kill -9 2>/dev/null || true
  sleep 1
fi

# ── 5. Reset + seed the test database ────────────────────────────────────────
# secrets.env uses plain (non-exported) assignments; source it with allexport
# so POSTGRES_PW reaches the reset script's child processes.
SECRETS_ENV="$FRONTEND_DIR/../.claude/secrets.env"
if [ -z "${POSTGRES_PW:-}" ] && [ -f "$SECRETS_ENV" ]; then
  set -a; # shellcheck disable=SC1090
  source "$SECRETS_ENV"; set +a
fi
if [ -z "${POSTGRES_PW:-}" ]; then
  fail "POSTGRES_PW is not set. Run: source .claude/secrets.env (repo root) first."
fi
export POSTGRES_PW
echo "[e2e] Resetting levelup_test database (Flask stays up; its pool reconnects)..."
bash "$FRONTEND_DIR/apps/web/e2e/scripts/reset-test-db.sh" || fail "DB reset failed"

# Flask survived the reset? (its pooled connections were terminated)
sleep 1
curl -sf -m 5 "$FLASK_HEALTH" >/dev/null || fail "Flask did not recover after the DB reset"
echo "[e2e] Flask healthy after reset."

# ── 6. Run the suite ─────────────────────────────────────────────────────────
command -v maestro >/dev/null || fail "maestro not found (expected in ~/.maestro/bin)"
echo "[e2e] Running Maestro flows..."
cd "$MOBILE_DIR"
SUITE_LOG=$(mktemp -t maestro-suite)
maestro --device "$SIM_UDID" test .maestro 2>&1 | tee "$SUITE_LOG"
STATUS=$?

# ── 7. Retry transiently-failed flows once ──────────────────────────────────
# The iOS XCTest driver occasionally aborts a flow within seconds with
# "Error getting element frame kAXErrorInvalidUIElement" (stale AX handle to
# a relaunching app). The next flow on the same driver is fine, so failed
# flows get exactly one individual re-run, in suite order. Assertions are
# unchanged — a real failure still fails twice.
if [ $STATUS -ne 0 ]; then
  FAILED_FLOWS=$(grep -oE '^\[Failed\] [0-9A-Za-z-]+' "$SUITE_LOG" | awk '{print $2}' | sort)
  if [ -n "$FAILED_FLOWS" ]; then
    echo "[e2e] Retrying failed flows once (transient driver flakes): $FAILED_FLOWS"
    STATUS=0
    for f in $FAILED_FLOWS; do
      echo "[e2e] Re-running $f ..."
      if ! maestro --device "$SIM_UDID" test ".maestro/flows/$f.yaml"; then
        echo "[e2e] $f failed again — real failure." >&2
        STATUS=1
      fi
    done
  fi
fi
rm -f "$SUITE_LOG"

if [ $STATUS -eq 0 ]; then
  echo "[e2e] Suite PASSED."
else
  echo "[e2e] Suite FAILED (exit $STATUS). Debug artifacts: ~/.maestro/tests/" >&2
fi
exit $STATUS
