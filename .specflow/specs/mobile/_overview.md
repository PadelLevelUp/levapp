# mobile — Mobile Platform Runtime

## What this is

Behaviour the Expo app owes to the platform it runs on, as opposed to a product feature: what
changes when the same screens run on Android instead of iOS.

## What it covers

- `mobile.android-runtime` — draft (PAD-298, wave B of the 2026-09-11 Android scoping decision:
  shadows, keyboard avoidance, the hardware back button, platform pickers and share, the
  notification permission prompt, verification on the CI emulator lane)

## Why it's grouped this way

Every other domain describes a feature that exists on web and iOS alike. Android runtime rules
cut across all of them and would otherwise be scattered one clause per leaf; one small domain
keeps the platform contract in one place and lets feature leaves stay platform-neutral.
