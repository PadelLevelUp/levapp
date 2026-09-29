#!/bin/bash
# Refuse an Xcode whose SDK the app cannot launch under
# (`mobile.release-build-target` rule 3a).
#
# A build linked against the iOS 27 SDK (Xcode 27) crashes at launch on iOS 27:
# the app has not adopted the UIScene lifecycle, and UIKit traps in
# `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption` before any JS
# loads. Found on 2026-09-29, when the release Mac came with Xcode 27. Until the
# app adopts UIScene (PAD-467), releases are archived with Xcode 26.x:
#
#   DEVELOPER_DIR=/Applications/Xcode_26.6.app/Contents/Developer scripts/ios-release.sh ...
#
# xcodebuild, xcrun and pod all honour DEVELOPER_DIR, so nothing else changes.
# LEVAPP_ALLOW_XCODE_27=1 lets a build through anyway, for PAD-467's own work.
set -euo pipefail

VERSION_LINE="$(xcodebuild -version 2>/dev/null | head -1 || true)"
MAJOR="$(printf '%s\n' "$VERSION_LINE" | sed -n 's/^Xcode \([0-9][0-9]*\)\..*/\1/p')"

if [ -z "$MAJOR" ]; then
  echo "check-xcode: cannot read the Xcode version (got \"$VERSION_LINE\"); refusing." >&2
  echo "check-xcode: set DEVELOPER_DIR to an Xcode 26.x, or run xcode-select, and retry." >&2
  exit 3
fi

if [ "$MAJOR" -ge 27 ]; then
  if [ "${LEVAPP_ALLOW_XCODE_27:-}" = "1" ]; then
    echo "check-xcode: WARNING: $VERSION_LINE allowed by LEVAPP_ALLOW_XCODE_27=1; this build will crash at launch on iOS 27 until PAD-467 lands." >&2
    exit 0
  fi
  echo "check-xcode: $VERSION_LINE links the iOS $MAJOR SDK, and this app crashes at launch under it (UIScene not adopted, PAD-467)." >&2
  echo "check-xcode: archive with Xcode 26.x: DEVELOPER_DIR=/Applications/Xcode_26.6.app/Contents/Developer scripts/ios-release.sh ..." >&2
  exit 3
fi

echo "check-xcode: $VERSION_LINE ok"
