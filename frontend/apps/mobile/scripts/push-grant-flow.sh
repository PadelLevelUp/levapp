#!/usr/bin/env bash
# PAD-744 — runs .maestro/flows/307-push-grant-without-restart.yaml from a denied notification
# permission. Requires the same prerequisites as e2e.sh (Flask, Metro, booted simulator with the dev
# build) — see the README.
#
#   bash apps/mobile/scripts/push-grant-flow.sh [SIM_UDID]
#
# Maestro 2.6.1 cannot set the notification permission (its `permissions:` maps skip it), so this
# sets it with the applesimutils Maestro ships. That restarts SpringBoard and kills the app, which is
# why it runs before the flow and never during it.
set -uo pipefail
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIM_UDID="${1:-180A9433-4EA7-4F9B-9FD1-79E1250BD9BB}"
export PATH="$HOME/.maestro/bin:$PATH"
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-120000}"

"$HOME/.maestro/deps/applesimutils" --byId "$SIM_UDID" --bundle com.padellevelup.app \
  --setPermissions notifications=NO || exit 1
# SpringBoard comes back within a few seconds; launching before it does fails the first launchApp.
sleep 8

maestro --device "$SIM_UDID" test "$MOBILE_DIR/.maestro/flows/307-push-grant-without-restart.yaml" "${@:2}"
