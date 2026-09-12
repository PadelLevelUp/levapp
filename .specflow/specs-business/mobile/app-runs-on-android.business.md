---
id: mobile.app-runs-on-android
status: draft
implemented_by:
  - ../../specs/mobile/android-runtime.spec.md
---

# The App Runs On Android

## Outcome

A coach or student with an Android phone installs LevApp from Google Play and uses every screen
the iOS app has — calendar, classes, presences, messages, training, settings — with the same
behaviour, the same Portuguese and English copy, and the platform's own conventions where they
differ (the back button, the date and time dialogs, the share sheet, the notification
permission prompt). Android is not a second product: whatever ships for iOS ships for Android.

## Who This Is For

Coaches and students on Android phones — today none can use the app at all (owner decision
2026-09-11: Android GO on waves A and B, PAD-290).

## User Journey

1. The person installs the app and signs in; the keyboard never hides the field they are
   typing in or the button they need next.
2. They use the calendar, open a class, mark presences, answer a reminder, write a message —
   every screen and action behaves as on iOS.
3. They press the phone's back button: an open dialog, menu or picker closes; a pulled-up day
   sheet drops back; otherwise the screen goes back as usual.
4. They pick a date or a time with Android's own dialogs, share an invite link with Android's
   share sheet, and are asked once for notification permission.
5. Reminders and messages reach the phone as push notifications (wave C) and the app appears
   on Google Play (wave D).

## Business Rules

1. Android ships with every feature iOS ships; a screen that behaves differently on Android is a
   bug, not a platform difference — unless the difference is the platform's own convention.
2. Verification happens on the CI emulator lane (PAD-297): a feature is "works on Android" when
   its Maestro flow is green there, not when it compiles.

## Success Metrics

- The login, calendar and class-detail Maestro flows are green on the Android emulator lane.
- No screen in the iOS suite is excluded from the Android run without a written reason.

## Out of Scope

- Push delivery on Android (wave C), the Play Store listing and signing (wave D), Android as a
  standing rule in every ticket (wave E) — see the 2026-09-11 Android scoping decision.

## Notes

- OPEN: none.
