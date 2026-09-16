#!/bin/bash
# Upload an export made by scripts/ios-release.sh to TestFlight and attach it to
# the Internal group (PAD-351). Never submits for App Store review.
#
#   scripts/testflight-upload.sh <build-number>
#
# Uses the App Store Connect API key (id 79ZZ536G63), not Xcode's account
# session, which expires. The Internal group uses manual distribution, so
# every build must be attached.
set -euo pipefail

BUILD="${1:?usage: scripts/testflight-upload.sh <build-number>}"
MOBILE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$MOBILE/../../.." && pwd)"
OUT="${RELEASE_OUT:-$REPO/build}"
EXPORT="$OUT/export-$BUILD"
KEY=79ZZ536G63
ISS=2cb8a0f4-101b-4cf9-aefc-7ad083614427

test -f "$EXPORT/release-target.txt" || { echo "no release-target.txt in $EXPORT: only exports from ios-release.sh are uploaded" >&2; exit 1; }
echo "== $(date -u +%H:%MZ) uploading build $BUILD: $(tr '\n' ' ' < "$EXPORT/release-target.txt")"
xcrun altool --upload-app -f "$EXPORT/LevApp.ipa" -t ios --apiKey "$KEY" --apiIssuer "$ISS"

echo "== $(date -u +%H:%MZ) waiting for processing, then attaching to the Internal group"
PY="${ASC_PYTHON:-$REPO/backend/.venv/bin/python}"
"$PY" "$MOBILE/scripts/asc_attach_build.py" "$BUILD"
