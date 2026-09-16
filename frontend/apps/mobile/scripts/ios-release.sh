#!/bin/bash
# Build an iOS release for a NAMED target (PAD-351, `mobile.release-build-target`).
#
#   scripts/ios-release.sh <production|staging> <version> <build-number>
#
# prebuild → pods from the cached React Native prebuilt tarballs → archive →
# bundle check → export. The API URL comes from release-targets.json for the
# target, never from the calling shell: builds 12 and 14-22 went to TestFlight
# pointing at staging because the shell had exported EXPO_PUBLIC_API_URL.
# The export only happens if the archived bundle names that target and nothing
# else, and declares the open-spots capability (PAD-352).
#
# Upload afterwards with scripts/testflight-upload.sh. The machine-level
# traps (run it under Monitor, not detached; nothing else heavy at the same
# time; the RN prebuilt tarballs) are in the memory notes on TestFlight and on
# RN prebuilt artifacts.
#
# Env overrides: RELEASE_OUT (default <repo>/build), RN_PREBUILT_PODS (a Pods
# directory holding ReactNativeCore-artifacts and ReactNativeDependencies-artifacts).
set -euo pipefail

TARGET="${1:-}"
VERSION="${2:-}"
BUILD="${3:-}"

MOBILE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$MOBILE/../../.." && pwd)"
cd "$MOBILE"

if [ -z "$TARGET" ] || [ -z "$VERSION" ] || [ -z "$BUILD" ]; then
  echo "usage: scripts/ios-release.sh <$(node -p 'Object.keys(require("./release-targets.json")).join("|")')> <version> <build-number>" >&2
  exit 2
fi
API_URL="$(node -e 'const t = require("./release-targets.json"); const u = t[process.argv[1]]; if (!u) process.exit(1); console.log(u);' "$TARGET")" || {
  echo "unknown target \"$TARGET\"; release-targets.json knows: $(node -p 'Object.keys(require("./release-targets.json")).join(", ")')" >&2
  exit 2
}
export EXPO_PUBLIC_API_URL="$API_URL"
echo "== $(date -u +%H:%MZ) target $TARGET -> $EXPO_PUBLIC_API_URL, version $VERSION build $BUILD"

KEY=79ZZ536G63
ISS=2cb8a0f4-101b-4cf9-aefc-7ad083614427
KP="$HOME/.appstoreconnect/private_keys/AuthKey_$KEY.p8"
OUT="${RELEASE_OUT:-$REPO/build}"
ARCHIVE="$OUT/LevApp-$BUILD.xcarchive"
PODS_CACHE="${RN_PREBUILT_PODS:-$HOME/levapp-tf-wt/frontend/apps/mobile/ios/Pods}"
mkdir -p "$OUT"

# The version and build number are set for this build only. app.json is
# restored on exit, so a release never leaves a bump behind to be committed.
cp app.json "$OUT/app.json.before-$BUILD"
trap 'cp "$OUT/app.json.before-$BUILD" "$MOBILE/app.json"' EXIT
node -e '
const fs = require("fs");
const d = JSON.parse(fs.readFileSync("app.json", "utf8"));
d.expo.version = process.argv[1];
d.expo.ios.buildNumber = process.argv[2];
fs.writeFileSync("app.json", JSON.stringify(d, null, 2) + "\n");
' "$VERSION" "$BUILD"

echo "== $(date -u +%H:%MZ) prebuild"
npm run prebuild:ios
npm run verify:splash

echo "== $(date -u +%H:%MZ) pod install from cached prebuilt tarballs"
export RCT_USE_PREBUILT_RNCORE=1 RCT_USE_RN_DEP=1
export RCT_TESTONLY_RNCORE_TARBALL_PATH="$PODS_CACHE/ReactNativeCore-artifacts/reactnative-core-0.81.5-release.tar.gz"
export RCT_USE_LOCAL_RN_DEP="$PODS_CACHE/ReactNativeDependencies-artifacts/reactnative-dependencies-0.81.5-release.tar.gz"
(cd ios && pod install)
grep -q "React-Core-prebuilt" ios/Podfile.lock || { echo "GUARD FAILED: React-Core-prebuilt missing"; exit 1; }
if grep -q "^  - fmt (" ios/Podfile.lock; then echo "GUARD FAILED: fmt pod present (building RN from source)"; exit 1; fi

echo "== $(date -u +%H:%MZ) archive"
rm -rf "$ARCHIVE"
xcodebuild -workspace ios/LevApp.xcworkspace -scheme LevApp -configuration Release -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" archive -quiet \
  -allowProvisioningUpdates -authenticationKeyPath "$KP" -authenticationKeyID "$KEY" -authenticationKeyIssuerID "$ISS"
APP="$ARCHIVE/Products/Applications/LevApp.app"
test -f "$APP/main.jsbundle" || { echo "ARCHIVE FAILED: no main.jsbundle"; exit 1; }
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' -c 'Print :CFBundleVersion' "$APP/Info.plist"

echo "== $(date -u +%H:%MZ) bundle check"
node scripts/verify-release-bundle.mjs "$APP/main.jsbundle" "$TARGET"

echo "== $(date -u +%H:%MZ) export"
cat > "$OUT/ExportOptions.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>9K2J8D2ARR</string>
  <key>uploadSymbols</key><true/>
  <key>manageAppVersionAndBuildNumber</key><false/>
  <key>destination</key><string>export</string>
</dict>
</plist>
PLIST
EXPORT="$OUT/export-$BUILD"
rm -rf "$EXPORT"
xcodebuild -exportArchive -archivePath "$ARCHIVE" -exportOptionsPlist "$OUT/ExportOptions.plist" -exportPath "$EXPORT" \
  -allowProvisioningUpdates -authenticationKeyPath "$KP" -authenticationKeyID "$KEY" -authenticationKeyIssuerID "$ISS"
test -f "$EXPORT/LevApp.ipa" || { echo "EXPORT FAILED"; exit 1; }
# The upload script refuses an export without this marker.
printf '%s\n' "$TARGET" "$API_URL" "$VERSION" "$BUILD" > "$EXPORT/release-target.txt"
echo "== $(date -u +%H:%MZ) RELEASE READY: $EXPORT/LevApp.ipa ($TARGET, $API_URL)"
