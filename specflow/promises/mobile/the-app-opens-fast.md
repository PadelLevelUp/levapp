---
id: P-MOBILE-6
title: "The app opens fast"
status: draft
---
# The app opens fast

## Outcome

Someone opening the iOS app can see and tap their screen about as soon as the app has what it needs to draw it, not after a fixed brand animation on top of a chain of waits. The brand moment still plays whole when the app is slower than it.

- Nothing waits in line that could run at the same time (fonts and the session check).
- The launch animation never costs more than the app's own readiness plus a short grace.
- The first interactive frame is timed on the simulator before and after any change to the launch (PAD-571's method).

It does not promise a data cache kept across launches, or anything for the web app.
