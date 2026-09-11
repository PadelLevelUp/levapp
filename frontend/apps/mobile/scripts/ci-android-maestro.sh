#!/usr/bin/env bash
# =============================================================================
# LevApp — Android CI lane (PAD-297): install the built APK on the booted
# emulator and run the Maestro flows. Called by .github/workflows/android-build.yaml
# inside reactivecircus/android-emulator-runner, which executes its `script:`
# with /bin/sh (dash) — hence a real bash file here, not inline shell.
#
# Env (set by the workflow):
#   MAESTRO_FLOWS      space-separated flow paths relative to apps/mobile/.maestro
#   RUNNER_TEMP        where the artefact was downloaded ($RUNNER_TEMP/apk/app-release.apk)
#   GITHUB_WORKSPACE   repo root; the junit report is written there
# =============================================================================
set -euo pipefail

APK="${APK_FILE:-$RUNNER_TEMP/apk/app-release.apk}"
ROOT="${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/../../.." && pwd)}"
FLOWS="${MAESTRO_FLOWS:-flows/01-login.yaml}"
APP_ID="com.padellevelup.app"

adb wait-for-device
adb install -r "$APK"
# Android 13+: the registrar asks for notification permission at login; grant it
# up front so no system dialog interrupts the flows (mobile.android-runtime rule 6).
adb shell pm grant "$APP_ID" android.permission.POST_NOTIFICATIONS
adb shell pm list packages | grep -q "$APP_ID"

cd "$ROOT/frontend/apps/mobile/.maestro"
echo "flows: $FLOWS"
# shellcheck disable=SC2086  # FLOWS is a space-separated list on purpose
maestro test --format junit --output "$ROOT/maestro-report.xml" $FLOWS
