#!/usr/bin/env bash
# =============================================================================
# LevApp — Google Play phone screenshots (PAD-608 item 5). Called by
# .github/workflows/android-store-screenshots.yaml inside
# reactivecircus/android-emulator-runner (its `script:` runs under /bin/sh, hence a bash file).
#
# Installs the CI APK, grants notifications, puts the status bar in demo mode (09:41, full
# battery, wifi) and runs capture.yaml with Maestro. The PNGs land in $OUT
# (default ~/.maestro/store-shots); Maestro's own output goes to ~/.maestro/tests/store-shots.
#
# Env: RUNNER_TEMP / APK_FILE (the APK), GITHUB_WORKSPACE (repo root), OUT (output folder).
# =============================================================================
set -euo pipefail

APK="${APK_FILE:-$RUNNER_TEMP/apk/app-release.apk}"
ROOT="${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/../../../../.." && pwd)}"
APP_ID="com.padellevelup.app"
OUT="${OUT:-$HOME/.maestro/store-shots}"
TEST_OUT="$HOME/.maestro/tests/store-shots"
HERE="$ROOT/frontend/apps/mobile/store/android/screenshots"

mkdir -p "$OUT" "$TEST_OUT"
rm -f "$OUT"/*.png

adb wait-for-device
adb install -r "$APK"
# Android 13+: no system dialog may interrupt the capture.
adb shell pm grant "$APP_ID" android.permission.POST_NOTIFICATIONS
adb shell pm list packages | grep -q "$APP_ID"

# Clean status bar: SystemUI demo mode. Order matters: allow, enter, then the pieces.
adb shell settings put global sysui_demo_allowed 1
demo() { adb shell am broadcast -a com.android.systemui.demo "$@" > /dev/null; }
demo -e command enter
demo -e command clock -e hhmm 0941
demo -e command battery -e level 100 -e plugged false
demo -e command network -e wifi show -e level 4 -e fully true
demo -e command network -e mobile show -e datatype none -e level 4 -e fully true
demo -e command notifications -e visible false
demo -e command status -e volume hide

echo "screen size: $(adb shell wm size | tr -d '\r')"

set +e
maestro test --test-output-dir "$TEST_OUT" -e "OUT=$OUT" "$HERE/capture.yaml"
RC=$?
set -e
demo -e command exit || true

# Maestro 2.6.1 takeScreenshot with an absolute path writes <path>.png; if it ever resolves
# relative paths instead, fall back to the numbered PNGs in the test output.
if ! ls "$OUT"/*.png > /dev/null 2>&1; then
  echo "no PNG in $OUT; looking in the Maestro output"
  find "$TEST_OUT" -name '[0-9][0-9]-*.png' -exec cp {} "$OUT"/ \;
fi
ls -la "$OUT"
[ "$RC" -eq 0 ] || { echo "::error::Maestro exited $RC"; exit "$RC"; }

COUNT=$(find "$OUT" -maxdepth 1 -name "*.png" | wc -l)
[ "$COUNT" -ge 2 ] && [ "$COUNT" -le 8 ] || { echo "::error::$COUNT screenshots; Google Play takes 2 to 8"; exit 1; }

# Google Play: each side 320-3840 px, long side at most 2x the short side.
python3 - "$OUT" <<'PY'
import glob, struct, sys
bad = 0
for f in sorted(glob.glob(sys.argv[1] + "/*.png")):
    with open(f, "rb") as fh:
        head = fh.read(24)
    w, h = struct.unpack(">II", head[16:24])
    ok = 320 <= min(w, h) and max(w, h) <= 3840 and max(w, h) <= 2 * min(w, h)
    print(f"{f}: {w}x{h} ratio {max(w, h) / min(w, h):.2f} {'ok' if ok else 'REJECTED BY PLAY'}")
    bad += 0 if ok else 1
sys.exit(1 if bad else 0)
PY
