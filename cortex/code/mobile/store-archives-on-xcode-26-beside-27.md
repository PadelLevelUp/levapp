---
about: "Store archives run under Xcode 26.6 selected by DEVELOPER_DIR while the Mac's default Xcode is 27.2; proven on builds 37 and 38, no Xcode sign-in needed"
permanence: changing
verified: "2026-11-20 (observed)"
origin:
  - session:1f2b6f85-3591-4547-8797-325a278a29e9
need:
  - frontend/apps/mobile/scripts/check-xcode.sh
  - frontend/apps/mobile/scripts/ios-release.sh
---

# Store archives on a Mac with two Xcodes

An archive built with the iOS 27 SDK traps at launch (UIScene not adopted, see `now/ios-27-sdk-required-from-april-2027.md`),
so `check-xcode.sh` refuses Xcode 27 for release runs. On a Mac whose default Xcode is 27, keep an Xcode 26 install beside it
and point the release run at it with the variable, never with `xcode-select`:

```
DEVELOPER_DIR=/Applications/Xcode_26.6.app/Contents/Developer \
RN_PREBUILT_PODS=<main checkout>/frontend/apps/mobile/ios/Pods \
scripts/ios-release.sh production <version> <build>
```

Proven twice (1.3.4 build 37 on 2026-11-18, 1.3.5 build 38 on 2026-11-20): from a detached worktree at the release commit, no
Xcode account signed in (`-allowProvisioningUpdates` with the App Store Connect key), archive plus export in about 3 minutes,
`testflight-upload.sh <version> <build>` and Apple's VALID in about 3 more. Run the archive under a shared heavy slot: it
takes every core.

A copied Xcode (not from the App Store) works if `codesign --verify --deep --strict` and `spctl` accept it and
`-runFirstLaunch` has run; the runtime it needs is iOS 26.5.

Filing: store archives run under Xcode 26.6 by DEVELOPER_DIR beside a default Xcode 27 → code/mobile/store-archives-on-xcode-26-beside-27.md (origin: session:1f2b6f85-3591-4547-8797-325a278a29e9)
