#!/usr/bin/env bash
# PAD-744 — runs .maestro/flows/307-push-grant-without-restart.yaml from a denied notification
# permission. Requires the same prerequisites as e2e.sh (Flask, Metro, booted simulator with the dev
# build) — see the README.
#
#   bash apps/mobile/scripts/push-grant-flow.sh [SIM_UDID] [maestro test options for 307]
#
# Maestro 2.6.1 cannot set the notification permission (its `permissions:` maps skip it), so this
# sets it with the applesimutils Maestro ships. That restarts SpringBoard and kills the app, which is
# why it runs before the flow and never during it.
#
# PAD-752: the order is prep → deny → check → 307, with no clearState after the deny. The prep
# subflow launches with clearState and waits for the login screen, so the bundle is built and the
# app is signed out before 307 starts: a slow cold launch can no longer push login.yaml into its own
# clearState relaunch, which re-grants notifications, and 307 always takes the signed-out path. The
# permission is read back from SpringBoard after the deny, and again if 307 fails, so a re-grant is
# named instead of showing up as a missing banner.
set -uo pipefail
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SIM_UDID="${1:-180A9433-4EA7-4F9B-9FD1-79E1250BD9BB}"
BUNDLE_ID=com.padellevelup.app
export PATH="$HOME/.maestro/bin:$PATH"
export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-120000}"

# SpringBoard's stored authorizationStatus for the app (1 denied, 2 authorized), or "none".
notification_status() {
  /usr/bin/python3 -I - "$HOME/Library/Developer/CoreSimulator/Devices/$SIM_UDID/data/Library/BulletinBoard/VersionedSectionInfo.plist" "$BUNDLE_ID" <<'EOF'
import plistlib, sys
def find(o, key):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == key:
                return v
            r = find(v, key)
            if r is not None:
                return r
try:
    objs = plistlib.loads(find(plistlib.load(open(sys.argv[1], "rb")), sys.argv[2]))["$objects"]
    print(next(o["authorizationStatus"] for o in objs if isinstance(o, dict) and "authorizationStatus" in o))
except Exception:
    print("none")
EOF
}

maestro --device "$SIM_UDID" test "$MOBILE_DIR/.maestro/subflows/push-grant-prep.yaml" || {
  echo "PREP FAILED: the app did not reach the login screen after a clearState launch" >&2; exit 1; }

"$HOME/.maestro/deps/applesimutils" --byId "$SIM_UDID" --bundle "$BUNDLE_ID" \
  --setPermissions notifications=NO || exit 1
# SpringBoard comes back within a few seconds; launching before it does fails the first launchApp.
sleep 8

status="$(notification_status)"
echo "notification authorizationStatus after the deny: $status"
[ "$status" = "1" ] || { echo "DENY FAILED: expected authorizationStatus 1 (denied), got $status" >&2; exit 1; }

maestro --device "$SIM_UDID" test "$MOBILE_DIR/.maestro/flows/307-push-grant-without-restart.yaml" "${@:2}"
rc=$?
if [ "$rc" -ne 0 ]; then
  echo "307 failed (exit $rc); notification authorizationStatus now: $(notification_status)" \
    "(2 at the banner step means the permission was re-granted during the flow, B-680)" >&2
fi
exit "$rc"
