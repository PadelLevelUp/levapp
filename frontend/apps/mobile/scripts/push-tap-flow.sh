#!/usr/bin/env bash
# PAD-240 — runs .maestro/flows/47-push-tap-routing.yaml and delivers the
# simulated push it waits for. Requires the same prerequisites as e2e.sh
# (Flask, Metro, booted simulator with the dev build) — see the README.
#
#   bash apps/mobile/scripts/push-tap-flow.sh [SIM_UDID]
#
# Handshake: Maestro prints each step as it completes, so the wrapper tails
# its output and sends the push the moment "conversation-item-1 is visible"
# completes — i.e. login-coach has run and the flow is parked on the Messages
# tab, waiting up to 45 s for the banner. A fixed delay is not enough: on this
# simulator `launchApp` can stall for minutes in simctl's privacy step (Maestro
# retries it), and a push delivered before the app is up is a banner nobody
# sees.
set -uo pipefail
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIM_UDID="${1:-180A9433-4EA7-4F9B-9FD1-79E1250BD9BB}"
READY_TIMEOUT="${READY_TIMEOUT:-900}"   # seconds to wait for the Messages tab
export PATH="$HOME/.maestro/bin:$PATH"
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-120000}"

OUT="$(mktemp -t pad240-maestro)"
maestro --device "$SIM_UDID" test "$MOBILE_DIR/.maestro/flows/47-push-tap-routing.yaml" > "$OUT" 2>&1 &
MAESTRO_PID=$!

for _ in $(seq 1 "$READY_TIMEOUT"); do
  if grep -q "conversation-item-1 is visible... COMPLETED" "$OUT"; then
    xcrun simctl push "$SIM_UDID" com.padellevelup.app \
      "$MOBILE_DIR/scripts/push-payloads/message.apns"
    break
  fi
  kill -0 "$MAESTRO_PID" 2>/dev/null || break
  sleep 1
done

wait "$MAESTRO_PID"; STATUS=$?
cat "$OUT"; rm -f "$OUT"
exit $STATUS
