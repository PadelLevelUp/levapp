#!/usr/bin/env bash
# PAD-146 — fail if the generated iOS launch screen is Expo's default
# placeholder rather than our own splash asset.
#
# Why this exists: `apps/mobile/ios/` is gitignored and is only regenerated
# when `expo prebuild` is explicitly run. LevApp 1.1.0 was archived from an
# ios/ directory generated before the real splash asset landed, so the native
# launch screen still carried Expo's default placeholder (a grey grid with
# concentric circles). On cold start iOS showed that placeholder for a beat
# before the JS launch animation took over — which is what PAD-146 reported.
#
# Run this before archiving a release. It is a guard, not a fix: the fix is to
# run `npm run prebuild:ios`, which regenerates the native project from the
# current app config and assets.
set -euo pipefail

cd "$(dirname "$0")/.."

# The native project directory is named after the app (LevelUp before the
# rebrand, LevApp after), so locate it rather than hardcoding the name.
GENERATED="$(ls ios/*/Images.xcassets/SplashScreenLegacy.imageset/image.png 2>/dev/null | head -1)"
if [ -z "$GENERATED" ]; then
  echo "FAIL: no ios/*/Images.xcassets/SplashScreenLegacy.imageset/image.png — run 'npm run prebuild:ios' before archiving." >&2
  exit 1
fi
SOURCE="assets/splash-icon.png"
# sha1 of Expo's default splash placeholder as generated into this project.
PLACEHOLDER_SHA="883431ee5f40bcef96a27f1bf5514db14d984a85"

if [ ! -f "$GENERATED" ]; then
  echo "FAIL: $GENERATED is missing — run 'npm run prebuild:ios' before archiving." >&2
  exit 1
fi

ACTUAL_SHA="$(shasum "$GENERATED" | awk '{print $1}')"

if [ "$ACTUAL_SHA" = "$PLACEHOLDER_SHA" ]; then
  echo "FAIL: the native launch screen is Expo's default placeholder, not our splash." >&2
  echo "      This is exactly the PAD-146 bug. Run 'npm run prebuild:ios', then rebuild." >&2
  exit 1
fi

# A native project older than the splash asset cannot contain it. Catches the
# general staleness case, not just the one placeholder we have seen.
if [ "$GENERATED" -ot "$SOURCE" ]; then
  echo "FAIL: $GENERATED is older than $SOURCE — the native project predates the" >&2
  echo "      current splash asset. Run 'npm run prebuild:ios', then rebuild." >&2
  exit 1
fi

echo "OK: native launch screen is generated from the current splash asset."
