---
about: "iOS 1.3.5 (build 38): 1.3.4's source plus the push-token-loop fix (PAD-741), built, submitted with an expedited review and live the same evening, 2026-11-20"
permanence: stable
verified: "2026-11-20 (observed)"
origin:
  - session:1f2b6f85-3591-4547-8797-325a278a29e9
kind: change
status: recorded
---

On 2026-11-20 iOS 1.3.4 (build 37, released that morning) was found slow on phones with notifications on: the push-token
listener re-registered the device token in a loop (PAD-741). The fix was one mobile file. The releases lead built 1.3.5
build 38 from 1.3.4's exact source plus that fix (branch `release/1.3.5`, pushed without a PR), proved the fix in the bundle
(`code/mobile/proving-a-js-fix-is-in-the-ipa.md`), uploaded it, created the store version with `AFTER_APPROVAL`, submitted
it at 15:56Z and filed Apple's expedited-review form; the owner confirmed from TestFlight that notifications on was fast
again. Apple took the build into review at 20:57Z and approved it at 21:21Z, and it went live at once. The same fix reached
production's web and server through the normal staging-to-main promotion that evening. Facts about the form and the API
calls: `world/systems/app-store-connect.md`.

Filing: iOS 1.3.5 build 38, the expedited push-token-loop fix, live 2026-11-20 21:21Z → history/changes/2026-11-20-ios-1-3-5-expedited-fix.md (origin: session:1f2b6f85-3591-4547-8797-325a278a29e9)
