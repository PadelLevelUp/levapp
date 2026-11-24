---
about: "Open risk: App Store uploads need the iOS 27 SDK from April 2027 and our app built with it traps at launch; path and ticket wait on the owner"
permanence: volatile
verified: "2026-11-23 (observed)"
origin:
  - session:1f2b6f85-3591-4547-8797-325a278a29e9
---

## iOS 27 SDK required for App Store uploads from April 2027
until: 2027-04-01

App Store Connect warned on the 1.3.5 upload (2026-11-20, warning 90725) that uploads must be built with the iOS 27 SDK from
April 2027. An app built with that SDK must adopt the UIScene life cycle or it traps at launch, and ours (Expo SDK 54, React
Native 0.81) does trap, so store builds still use Xcode 26.6 (`code/mobile/store-archives-on-xcode-26-beside-27.md`). Scene
support arrives with React Native 0.88 / Expo SDK 58 (PAD-512), as an opt-in on Expo SDK 57, or by a hand-written
scene-delegate config plugin on SDK 54. The written plan with the three options and dates is a local handoff of 2026-11-20;
which ticket carries it and whether a December spike runs wait on the owner. Expires when a store build ships from Xcode 27.

Filing: iOS 27 SDK required for uploads from April 2027, path undecided → now/ios-27-sdk-required-from-april-2027.md (origin: session:1f2b6f85-3591-4547-8797-325a278a29e9)
