#!/bin/bash
# =============================================================================
# smoke.sh — check a deployed environment through its public hostnames (PAD-703, rule 11)
#
#   bash infra/k8s/smoke.sh https://staging.levapp.app [https://api.staging.levapp.app]
#
# Always (no account): /api/app/healthz 200 (ok or schema_ahead), /api/app/livez 200, the web root
# 200, the AASA file as application/json, and plain HTTP answering 301 to https.
# With GKE_SMOKE_USERNAME and GKE_SMOKE_PASSWORD set (staging's smoke user; never a real person's
# account): sign in, /api/auth/me, the calendar for this week, the signed avatar URL that /me
# returns (it must carry X-Goog-Signature and answer 200: Workload Identity + Token Creator,
# PAD-701), and an SSE stream held open SSE_SECONDS (60) through the Gateway.
# The load balancer's own 5xx are not in any log (rule 4): the workflow reads them from Cloud
# Monitoring. Never prints the password or a token.
# =============================================================================
set -uo pipefail
BASE="${1:?usage: smoke.sh <https://web-host> [<https://api-host>]}"
API="${2:-$BASE}"
SSE_SECONDS="${SSE_SECONDS:-60}"
CURL="${CURL:-curl}"
fail=0
ok() { echo "PASS $*"; }
bad() { echo "FAIL $*"; fail=1; }
code() { "$CURL" -s -o /dev/null -m 10 -w '%{http_code}' "$@"; }

[ "$(code "$API/api/app/healthz")" = 200 ] && ok "healthz" || bad "healthz is not 200"
[ "$(code "$API/api/app/livez")" = 200 ] && ok "livez" || bad "livez is not 200"
[ "$(code "$BASE/")" = 200 ] && ok "web root" || bad "web root is not 200"
ctype=$("$CURL" -s -o /dev/null -m 10 -w '%{content_type}' "$BASE/.well-known/apple-app-site-association")
case "$ctype" in application/json*) ok "AASA is application/json" ;; *) bad "AASA content type is '$ctype'" ;; esac
plain="http://${BASE#https://}/"
redirect=$("$CURL" -s -o /dev/null -m 10 -w '%{http_code} %{redirect_url}' "$plain")
case "$redirect" in "301 https://"*) ok "HTTP redirects to HTTPS" ;; *) bad "HTTP answered '$redirect'" ;; esac

if [ -z "${GKE_SMOKE_USERNAME:-}" ] || [ -z "${GKE_SMOKE_PASSWORD:-}" ]; then
  echo "SKIP signed-in checks (no smoke account for this environment)"
  exit "$fail"
fi

body=$(python3 -c 'import json,os; print(json.dumps({"username": os.environ["GKE_SMOKE_USERNAME"], "password": os.environ["GKE_SMOKE_PASSWORD"]}))')
token=$("$CURL" -s -m 15 -H 'Content-Type: application/json' -d "$body" "$API/api/auth/login" \
  | python3 -c 'import json,sys
try: print(json.load(sys.stdin).get("accessToken") or "")
except Exception: print("")')
if [ -z "$token" ]; then bad "sign-in (no token)"; exit 1; fi
ok "sign-in"
auth=(-H "Authorization: Bearer $token")
me=$("$CURL" -s -m 15 "${auth[@]}" "$API/api/auth/me")
[ -n "$me" ] && ok "/api/auth/me" || bad "/api/auth/me answered nothing"
from=$(date -u +%Y-%m-%dT00:00:00Z); to=$(date -u -d '+7 days' +%Y-%m-%dT00:00:00Z 2>/dev/null || date -u -v+7d +%Y-%m-%dT00:00:00Z)
[ "$(code "${auth[@]}" "$API/api/app/calendar?from=$from&to=$to")" = 200 ] && ok "calendar" || bad "calendar is not 200"
avatar=$(printf '%s' "$me" | grep -oE 'https://[^"]*X-Goog-Signature[^"]*' | head -1 | sed 's/\\u0026/\&/g')
if [ -z "$avatar" ]; then bad "the smoke user's /me has no signed avatar URL (set an avatar on it; PAD-701)"
elif [ "$(code "$avatar")" = 200 ]; then ok "signed avatar URL answers 200"
else bad "signed avatar URL does not answer 200"; fi
# The stream must still be open when curl gives up at SSE_SECONDS (exit 28), having sent its greeting.
stream=$("$CURL" -s -N -m "$SSE_SECONDS" "$API/api/app/events?token=$token" 2>/dev/null); rc=$?
if [ "$rc" = 28 ] && printf '%s' "$stream" | grep -q ': connected'; then ok "SSE open ${SSE_SECONDS}s"
else bad "SSE closed early (curl exit $rc)"; fi
exit "$fail"
