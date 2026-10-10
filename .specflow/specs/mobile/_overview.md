# mobile — Mobile Platform Runtime

## What this is

Behaviour the Expo app owes to the platform it runs on and to the way it is built, as opposed to
a product feature: what changes when the same screens run on Android instead of iOS, and which
server a given build talks to.

## What it covers

- `mobile.android-runtime` — draft (PAD-298, wave B of the 2026-09-11 Android scoping decision:
  shadows, keyboard avoidance, the hardware back button, platform pickers and share, the
  notification permission prompt, verification on the CI emulator lane)
- `mobile.release-build-target` — draft (PAD-351: a release build names its API target, the
  archived bundle is checked against it before upload, and a non-production build shows its
  server in Settings and on sign-in)
- `mobile.status-bar` — implementing (PAD-419 / D136: dark status-bar content on the light
  screens, light on the navy ones; the shared `Screen` decides)
- `mobile.install-suggestion` — draft (PAD-573: the web app on an iPhone suggests the iOS app to a
  student, dismissible for 30 days, plus Safari's Smart App Banner; web-only by nature)
- `mobile.interaction-performance` — draft (PAD-592, from the PAD-571 speed study: a keystroke
  re-renders the composer and not the thread, one invalidation per incoming message,
  `inactive → active` is not a focus event, the week day-sheet drags on a shared value over a
  memoised grid, calendar ranges keep the previous data, the courts query waits for the club;
  iOS-only by nature)

## Why it's grouped this way

Every other domain describes a feature that exists on web and iOS alike. Android runtime rules
cut across all of them and would otherwise be scattered one clause per leaf; one small domain
keeps the platform contract in one place and lets feature leaves stay platform-neutral.
