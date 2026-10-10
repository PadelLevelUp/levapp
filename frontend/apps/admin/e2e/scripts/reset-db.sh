#!/usr/bin/env bash
# admin.phone-console rule 7 (PAD-572): reset this checkout's E2E database BEFORE Playwright
# starts. Playwright boots the Flask webServer before globalSetup, so a reset inside globalSetup
# would drop the database under a live server (its scheduler sweep deadlocked the rebuild on
# 2026-10-09). The name matches apps/web/e2e/isolation.ts: E2E_DB_NAME if set, levelup_test with
# E2E_SHARED=1, else levelup_e2e_<first 8 hex of sha1(resolved path of apps/web)>.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="$(cd "$HERE/../../../web" && pwd)"
if [ -n "${E2E_DB_NAME:-}" ]; then
  DB="$E2E_DB_NAME"
elif [ "${E2E_SHARED:-}" = "1" ]; then
  DB="levelup_test"
else
  DB="levelup_e2e_$(printf '%s' "$WEB_DIR" | shasum | cut -c1-8)"
fi
echo "[admin reset-db] resetting $DB"
E2E_DB_NAME="$DB" bash "$WEB_DIR/e2e/scripts/reset-test-db.sh"
