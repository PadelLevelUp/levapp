---
id: mobile.system-bar-stays-readable
status: draft
implemented_by:
  - ../../specs/mobile/status-bar.spec.md
---

# The phone's own status bar stays readable on every screen

## Outcome

On an iPhone, the clock, signal and battery at the top of the screen are always legible in
LevApp: light over the app's dark navy headers, dark over its light screens. Nobody opens a
player's evaluations or the share screen and finds the top of the phone washed out.

## Who This Is For

Every coach and student on iOS, and anyone judging the app from its App Store screenshots.

## User Journey

1. A coach opens a player, then their evaluations: the top bar reads dark on the light screen.
2. They go back to the Players tab: the top bar reads light on the navy header again.

## Business Rules

- The status bar always contrasts with whatever the app paints under it.
- It follows the screen on screen: going back restores the previous screen's style.

## Success Metrics

- No App Store screenshot or user report shows a status bar that can't be read.

## Out of Scope

- The web app. A browser draws its own bar, with a fixed theme colour, so there is nothing to
  switch.
- Android's status bar and navigation bar colours (`mobile.android-runtime`).

## Notes

- Decided by the owner through the coordinator (D136, 2026-09-24), after the 1.2.0 screenshot
  session showed it on two screens (PAD-419).
