---
id: B-207
title: "iOS debug client traps at launch on this Mac's simulators: expo-device force-unwraps NXGetLocalArchInfo()"
type: missing-criterion
severity: medium
status: triaged
affects:
  - frontend/apps/mobile/node_modules/expo-device/ios/DeviceModule.swift
  - frontend/apps/mobile/package.json
proposed_fix: "Unverified on device, so no repo change yet. If build 27's TestFlight install runs on the owner's phone, keep this as a simulator-host issue and carry a patch-package patch (guard the NXGetLocalArchInfo() pointer) or take the expo-device release that fixes it, alongside PAD-467's upgrade. If the device also traps, it is a release blocker."
opened: 2026-09-29T15:02:19Z
---

# B-207: expo-device's `cpuArchitectures()` traps on the simulator (NXGetLocalArchInfo returns nothing)

**Source:** Session-D, building the iOS debug client on the new release Mac (2026-09-29). The Mac has macOS 27 and Xcode 27.0 (27A266a); the simulator is an iPhone 17 Pro simulator on the **iOS 26.5** runtime (23F73). The client was built from staging `64b605ab` (Expo 54.0.37, RN 0.81.5, expo-device **8.0.10**).

**What happens:** the app launches and Metro bundles the JS (3441 modules). The app then dies before the first screen. The crash report (`LevApp-2026-09-29-155803.ips`) shows EXC_BREAKPOINT / SIGTRAP, with the triggering thread:
```
libswiftCore  _assertionFailure(_:_:file:line:flags:)
LevApp.debug  cpuArchitectures()
LevApp.debug  closure #14 in DeviceModule.definition()
LevApp.debug  ConstantDefinition.buildGetter(appContext:)
LevApp.debug  EXJavaScriptRuntime.createSyncFunction(...)
```
`expo-device/ios/DeviceModule.swift:138` reads `NXGetLocalArchInfo().pointee.name`, where `NXGetLocalArchInfo()` is an implicitly unwrapped pointer. That it returns NULL on this host's simulator is **inferred** from the trap frame and from the guard below clearing it; the return value was not observed directly. The implicit unwrap traps when JS first reads the `Device` constants.

**Local patch that clears it (not in git):**
```swift
guard let info = NXGetLocalArchInfo(), let archRaw = info.pointee.name else { return nil }
```
With it (and the Podfile patch below), the Maestro launch smoke passes: `launchApp clearState`, then `login-username` is visible. No new crash report.

**Scope, and what is NOT known:**
- **Unverified on device.** Builds 24–26 carried the same expo-device: `frontend/package-lock.json` resolves 8.0.10 at their SHAs `8cd96e557`, `58691238` and `ac5b4f844`, as at `64b605ab`. The owner used those builds on a physical iPhone (reported by the coordinator). That points at a simulator-on-this-host issue, but it has not been shown either way. Build 27's TestFlight install on the owner's phone is the device check.
- Unknown whether a Release build or an Xcode 26.6 build traps the same way on this Mac's simulators. The reading is that it is host/runtime behaviour, not the SDK, so it probably would.
- `npm ci` restores the unpatched file, so every fresh install needs the patch re-applied until the fix lands.

**Related (same session, same Mac):**
- PAD-467: Xcode 27 / iOS 27 SDK readiness. On the iOS **27** runtime the app traps earlier, at scene creation (UIScene not adopted).
- The Xcode 27 pod deployment-target error needs a second local patch: an `ios/Podfile` post_install that raises pod targets below 15.1 to 15.1.
- `scripts/check-xcode.sh` (#477) refuses Xcode 27 for release archives.

**Type:** `missing-criterion` records only the gap: nothing states that the debug client launches on the release Mac's simulator. No root cause is claimed beyond the crash frame.
