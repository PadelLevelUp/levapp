#!/bin/bash
# Upload an export made by scripts/ios-release.sh to TestFlight and attach it to
# the Internal group (PAD-351). Never submits for App Store review.
#
#   scripts/testflight-upload.sh <version> <build-number>
#
# Uses the App Store Connect API key (id 79ZZ536G63), not Xcode's account
# session, which expires. The Internal group uses manual distribution, so
# every build must be attached.
#
# Env: RELEASE_OUT (default ~/levapp-ios-archives/<version>-build<build>, the same
# default ios-release.sh writes to; rule 3d), ASC_PYTHON (the Python with PyJWT that
# runs asc_attach_build.py; default this checkout's backend venv, else the main
# worktree's; checked before the upload, rule 3e).
set -euo pipefail

VERSION="${1:-}"
BUILD="${2:-}"
if [ -z "$VERSION" ] || [ -z "$BUILD" ]; then
  echo "usage: scripts/testflight-upload.sh <version> <build-number>" >&2
  exit 2
fi
MOBILE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$MOBILE/../../.." && pwd)"
OUT="${RELEASE_OUT:-$HOME/levapp-ios-archives/$VERSION-build$BUILD}"
EXPORT="$OUT/export-$BUILD"
KEY=79ZZ536G63
ISS=2cb8a0f4-101b-4cf9-aefc-7ad083614427

test -f "$EXPORT/release-target.txt" || { echo "no release-target.txt in $EXPORT: only exports from ios-release.sh are uploaded" >&2; exit 1; }

# Rule 3e: the attach step's Python is found before anything is uploaded. A fresh release
# worktree has no backend venv, so the main worktree's is the fallback.
if [ -n "${ASC_PYTHON:-}" ]; then
  PY="$ASC_PYTHON"
else
  PY="$REPO/backend/.venv/bin/python"
  if [ ! -x "$PY" ]; then
    MAIN_WT="$(git -C "$REPO" worktree list --porcelain 2>/dev/null | sed -n '1s/^worktree //p' || true)"
    PY="${MAIN_WT:+$MAIN_WT/backend/.venv/bin/python}"
  fi
fi
if [ -z "$PY" ] || [ ! -x "$PY" ]; then
  echo "no Python for asc_attach_build.py (tried ${PY:-this checkout's and the main worktree's backend/.venv}); set ASC_PYTHON to a Python with PyJWT. Nothing was uploaded." >&2
  exit 2
fi

echo "== $(date -u +%H:%MZ) uploading build $BUILD: $(tr '\n' ' ' < "$EXPORT/release-target.txt")"
xcrun altool --upload-app -f "$EXPORT/LevApp.ipa" -t ios --apiKey "$KEY" --apiIssuer "$ISS"

echo "== $(date -u +%H:%MZ) waiting for processing, then attaching to the Internal group"
"$PY" "$MOBILE/scripts/asc_attach_build.py" "$BUILD"
