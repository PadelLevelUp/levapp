---
id: P-MOBILE-1
title: "The app runs on Android"
status: draft
---
# The app runs on Android

## Outcome

A coach or student with an Android phone uses every screen the iOS app has, with the same behaviour and the same Portuguese and English text, following the platform's own conventions where they differ (back button, date and time dialogs, share sheet, notification prompt). Whatever ships for iOS ships for Android (PAD-290).

- Android ships with every feature iOS ships; a screen that behaves differently on Android is a bug, unless the difference is the platform's own convention.
- A feature works on Android when its Maestro flow is green on the CI emulator lane, not when it compiles (PAD-297).

It does not promise Android push delivery, the Play Store listing and signing, or Android as a standing rule in every ticket, which are later waves.
