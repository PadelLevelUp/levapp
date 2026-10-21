#!/usr/bin/env bash
# =============================================================================
# LevApp — Android CI lane (PAD-297): install the built APK on the booted
# emulator and run the Maestro flows. Called by .github/workflows/android-build.yaml
# inside reactivecircus/android-emulator-runner, which executes its `script:`
# with /bin/sh (dash) — hence a real bash file here, not inline shell.
#
# Env (set by the workflow):
#   MAESTRO_FLOWS      space-separated flow paths relative to apps/mobile/.maestro
#   MAESTRO_SHARD      a shard number of the whole suite (PAD-710), "changed" for the PR's changed
#                      flows in MAESTRO_CHANGED_FLOWS (rule 1b), or "all" to run MAESTRO_FLOWS
#   FLOW_LIMIT_MIN / SHARD_BUDGET_MIN   the watchdog's limits (default 12 / 75)
#   MAESTRO_COACH_NOCLUB_USERNAME / _PASSWORD   flow 45's approved no-club coach;
#                      default the E2E seed's e2e-coach-noclub (PAD-306, no secret)
#   RUNNER_TEMP        where the artefact was downloaded ($RUNNER_TEMP/apk/app-release.apk)
#   GITHUB_WORKSPACE   repo root; the junit report is written there
# =============================================================================
set -euo pipefail

APK="${APK_FILE:-$RUNNER_TEMP/apk/app-release.apk}"
ROOT="${GITHUB_WORKSPACE:-$(cd "$(dirname "$0")/../../.." && pwd)}"
FLOWS="${MAESTRO_FLOWS:-flows/01-login.yaml}"
APP_ID="com.padellevelup.app"
# PAD-306: flow 45 logs in as an approved coach with no club; the E2E seed creates it.
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
# PAD-306: flows tagged `ios-only` (47-push-tap-routing drives `xcrun simctl push`)
# stay out of the Android run until wave C brings FCM push.
# PAD-314: flows tagged `open-defect-probe` probe a known-open defect (none today: 52 and 51 became guards when faces B and C were fixed) and
# run on demand only; config.yaml excludes the same tag for iOS whole-suite runs.
# PAD-345 (Maestro 2.6.1, verified): such a flow runs only when it is the ONLY
# entry in MAESTRO_FLOWS. Listed next to another flow it is silently dropped.
# PAD-314 (B-089 face C): stream the WHOLE run's device log. Maestro keeps a
# device-logcat.txt only for a flow that fails, so a passing run left no device
# evidence at all, and "no mounting exception" could not be checked. The file
# lands in ~/.maestro/tests, which the workflow uploads as maestro-results.
# Streaming, not `logcat -d` at the end: the ring buffer drops early lines on a
# long run.
mkdir -p "$HOME/.maestro/tests"
adb logcat -c || true
adb logcat -v threadtime > "$HOME/.maestro/tests/full-logcat.txt" 2>&1 &
LOGCAT_PID=$!
# PAD-710 (delivery.android-nightly-lane): MAESTRO_SHARD=<k> runs shard k of the whole suite
# through a generated workspace config (scripts/maestro-shards.mjs; the planner refuses a
# shard file that drops, doubles or splits a chain); "all" (or unset) runs MAESTRO_FLOWS.
SHARD="${MAESTRO_SHARD:-all}"
MOBILE="$ROOT/frontend/apps/mobile"
if [ "$SHARD" = all ]; then
  # shellcheck disable=SC2206  # FLOWS is a space-separated list on purpose
  TARGET=($FLOWS)
  CONFIG=()
else
  SHARD_CONFIG="$MOBILE/.maestro/shard-$SHARD.config.yaml"
  node "$MOBILE/scripts/maestro-shards.mjs" config "$SHARD" "$SHARD_CONFIG"
  TARGET=(.)
  CONFIG=(--config "$SHARD_CONFIG")
fi
# Rule 4: a watchdog stops Maestro when one flow runs past FLOW_LIMIT_MIN or the shard past
# SHARD_BUDGET_MIN (below the job's 90-min cap), and names the flow that was running, so a
# slow flow is a red with a name and never a run "cancelled" at the cap (PAD-710: 2026-10-08..21).
FLOW_LIMIT_MIN="${FLOW_LIMIT_MIN:-12}"
SHARD_BUDGET_MIN="${SHARD_BUDGET_MIN:-75}"
STOP_FILE="$HOME/.maestro/tests/watchdog-stop.txt"
OUT_LOG="$HOME/.maestro/tests/maestro-stdout.txt"
rm -f "$STOP_FILE"
set +e
maestro test --format junit --output "$ROOT/maestro-report.xml" \
  --exclude-tags ios-only,open-defect-probe \
  -e "MAESTRO_COACH_NOCLUB_USERNAME=$NOCLUB_USER" -e "MAESTRO_COACH_NOCLUB_PASSWORD=$NOCLUB_PASS" \
  "${CONFIG[@]}" "${TARGET[@]}" > "$OUT_LOG" 2>&1 &
MAESTRO_PID=$!
# The job log follows Maestro live; `tail --pid` ends when Maestro does, so the summary below
# reads a complete file (~/.maestro/bin/maestro execs java, so this pid is the JVM itself).
tail -n +1 -f --pid="$MAESTRO_PID" "$OUT_LOG" &
TAIL_PID=$!
node "$MOBILE/scripts/maestro-shards.mjs" watch "$MAESTRO_PID" "$HOME/.maestro/tests" "$STOP_FILE" "$FLOW_LIMIT_MIN" "$SHARD_BUDGET_MIN" &
WATCH_PID=$!
wait "$MAESTRO_PID"
RC=$?
wait "$TAIL_PID"
kill "$WATCH_PID" 2>/dev/null || true
set -e
sleep 2
kill "$LOGCAT_PID" 2>/dev/null || true
echo "full-logcat.txt: $(wc -l < "$HOME/.maestro/tests/full-logcat.txt") lines"
# Rule 5: this shard's results, by flow name, in the job summary.
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Maestro shard $SHARD"
    echo ""
    if grep -qE '\[(Passed|Failed)\]' "$OUT_LOG"; then
      grep -E '\[(Passed|Failed)\]' "$OUT_LOG" | sed 's/^/- /'
    else
      echo "- no flow finished"
    fi
    if [ -f "$STOP_FILE" ]; then
      sed 's/^::error title=\([^:]*\)::/- **\1:** /' "$STOP_FILE"
    fi
  } >> "$GITHUB_STEP_SUMMARY"
fi
if [ -f "$STOP_FILE" ]; then
  cat "$STOP_FILE"
  exit 1
fi
# A shard that finished without a stop must have reported every flow its config lists: a
# --config that resolved to fewer (or more) flows would otherwise pass quietly.
if [ "$SHARD" != all ]; then
  EXPECTED=$(grep -c '^    - ' "$SHARD_CONFIG")
  FINISHED=$(grep -cE '\[(Passed|Failed)\]' "$OUT_LOG" || true)
  if [ "$FINISHED" != "$EXPECTED" ]; then
    echo "::error title=Maestro shard ran the wrong flows::shard $SHARD reported $FINISHED flows; its config lists $EXPECTED"
    exit 1
  fi
fi
exit "$RC"
