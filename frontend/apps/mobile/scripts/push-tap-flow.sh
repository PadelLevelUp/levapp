#!/usr/bin/env bash
# PAD-240 — runs .maestro/flows/29-push-tap-routing.yaml and delivers the
# simulated push it waits for. Requires the same prerequisites as e2e.sh
# (Flask, Metro, booted simulator with the dev build) — see the README.
#
#   bash apps/mobile/scripts/push-tap-flow.sh [SIM_UDID]
set -uo pipefail
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIM_UDID="${1:-180A9433-4EA7-4F9B-9FD1-79E1250BD9BB}"
export PATH="$HOME/.maestro/bin:$PATH"
LOG="$(mktemp -t pad240-maestro)"

maestro --udid "$SIM_UDID" test "$MOBILE_DIR/.maestro/flows/29-push-tap-routing.yaml" >"$LOG" 2>&1 &
MAESTRO_PID=$!

# Wait until the flow is parked on the Messages tab (it logs the marker when
# it reaches the evalScript step), then deliver the push.
for _ in $(seq 1 60); do
  if grep -q "READY_FOR_PUSH\|evalScript" "$LOG" 2>/dev/null; then break; fi
  kill -0 "$MAESTRO_PID" 2>/dev/null || break
  sleep 1
done
sleep 2
xcrun simctl push "$SIM_UDID" com.padellevelup.app "$MOBILE_DIR/scripts/push-payloads/message.apns"

wait "$MAESTRO_PID"; STATUS=$?
cat "$LOG"
exit $STATUS
