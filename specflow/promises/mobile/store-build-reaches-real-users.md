---
id: P-MOBILE-2
title: "The store build reaches real users"
status: draft
---
# The store build reaches real users

## Outcome

An iOS build meant for the App Store always talks to the production server, whoever builds it and whatever their terminal holds. A build for testing on staging says so on screen, so nobody mistakes it for the real app.

- The App Store app uses `levapp.app`. `padellevelup.com` keeps serving production for App Store builds already installed; new builds do not use it.
- What a build is for is decided by name when it is made, not by the builder's environment.
- A non-production build shows its server where a tester looks first: the sign-in screen and Settings.

It does not promise submitting to the App Store or publishing on Google Play, which the owner does, or anything about the web app, which always calls the server it is served from.
