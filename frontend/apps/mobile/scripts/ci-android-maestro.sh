#!/usr/bin/env bash
# =============================================================================
# LevApp — Android CI lane (PAD-297): install the built APK on the booted
# emulator and run the Maestro flows. Called by .github/workflows/android-build.yaml
# inside reactivecircus/android-emulator-runner, which executes its `script:`
# with /bin/sh (dash) — hence a real bash file here, not inline shell.
#
# Env (set by the workflow):
#   MAESTRO_FLOWS      space-separated flow paths relative to apps/mobile/.maestro
#   MAESTRO_COACH_NOCLUB_USERNAME / _PASSWORD   flow 23's approved no-club coach;
#                      default the E2E seed's e2e-coach-noclub (PAD-306, no secret)
#   RUNNER_TEMP        where the artefact was downloaded ($RUNNER_TEMP/apk/app-release.apk)
#   GITHUB_WORKSPACE   repo root; the junit report is written there
# =============================================================================
set -euo pipefail

APK="${APK_FILE:-$RUNNER_TEMP/apk/app-release.apk}"
ROOT="${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/../../.." && pwd)}"
FLOWS="${MAESTRO_FLOWS:-flows/01-login.yaml}"
APP_ID="com.padellevelup.app"
# PAD-306: flow 23 logs in as an approved coach with no club; the E2E seed creates it.
NOCLUB_USER="${MAESTRO_COACH_NOCLUB_USERNAME:-e2e-coach-noclub}"
NOCLUB_PASS="${MAESTRO_COACH_NOCLUB_PASSWORD:-E2eCoach123!}"

adb wait-for-device
adb install -r "$APK"
# Android 13+: the registrar asks for notification permission at login; grant it
# up front so no system dialog interrupts the flows (mobile.android-runtime rule 6).
adb shell pm grant "$APP_ID" android.permission.POST_NOTIFICATIONS
adb shell pm list packages | grep -q "$APP_ID"

cd "$ROOT/frontend/apps/mobile/.maestro"
echo "flows: $FLOWS"
# PAD-306: flows tagged `ios-only` (29-push-tap-routing drives `xcrun simctl push`)
# stay out of the Android run until wave C brings FCM push.
# shellcheck disable=SC2086  # FLOWS is a space-separated list on purpose
maestro test --format junit --output "$ROOT/maestro-report.xml" \
  --exclude-tags ios-only \
  -e "MAESTRO_COACH_NOCLUB_USERNAME=$NOCLUB_USER" -e "MAESTRO_COACH_NOCLUB_PASSWORD=$NOCLUB_PASS" \
  $FLOWS
