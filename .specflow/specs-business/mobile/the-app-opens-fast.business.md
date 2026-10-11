---
id: mobile.the-app-opens-fast
status: draft
implemented_by:
  - ../../specs/mobile/launch.spec.md
---

# The App Opens Fast

## Outcome

A coach or student who opens the iOS app is looking at their screen, able to tap, about as soon as
the app has what it needs to draw it — not after a fixed brand animation has finished on top of a
chain of waits. The brand moment still plays whole when the app is slower than it.

## Who This Is For

Everyone who opens the app several times a day: the first interactive frame is the moment they
feel the app's speed.

## User Journey

1. The coach taps the icon. The mark forms on the navy screen.
2. Meanwhile the app loads its fonts and asks the server who is signed in, at the same time.
3. As soon as the first real screen is ready, the mark finishes its fade and the screen is there
   to tap — within a fraction of a second of the data, never before the fonts.

## Business Rules

1. Nothing waits in line that could run at the same time (fonts and the session check).
2. The launch animation never costs more than the app's own readiness plus a short grace; it is
   decoration, not a hold.
3. Measured, not assumed: the first interactive frame is timed on the simulator before and after
   any change to the launch (PAD-571's method).

## Success Metrics

- First interactive frame after a cold start with a signed-in session: under 1.5 s on the
  simulator (was ≈ 3.3 s plus the network).

## Out of Scope

- A persisted data cache across launches (a follow-up: it needs new packages).
- The web app (no launch overlay).

## Notes

- OPEN: none.
