#!/usr/bin/env bash
# PAD-240 — runs .maestro/flows/29-push-tap-routing.yaml and delivers the
# simulated push it waits for. Requires the same prerequisites as e2e.sh
# (Flask, Metro, booted simulator with the dev build) — see the README.
#
#   bash apps/mobile/scripts/push-tap-flow.sh [SIM_UDID]
#
# The push is sent PUSH_DELAY seconds (default 30) after the flow starts: by
# then login-coach has run and the flow is parked on the Messages tab waiting
# for the banner (it waits up to 45 s). Maestro cannot signal readiness to a
# shell, so a fixed delay is the only handshake there is.
set -uo pipefail
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIM_UDID="${1:-180A9433-4EA7-4F9B-9FD1-79E1250BD9BB}"
PUSH_DELAY="${PUSH_DELAY:-30}"
export PATH="$HOME/.maestro/bin:$PATH"
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-120000}"

maestro --device "$SIM_UDID" test "$MOBILE_DIR/.maestro/flows/29-push-tap-routing.yaml" &
MAESTRO_PID=$!

sleep "$PUSH_DELAY"
kill -0 "$MAESTRO_PID" 2>/dev/null && \
  xcrun simctl push "$SIM_UDID" com.padellevelup.app "$MOBILE_DIR/scripts/push-payloads/message.apns"

wait "$MAESTRO_PID"
