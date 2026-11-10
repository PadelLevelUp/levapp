---
id: P-CLIENT-2
title: "The web app opens quickly on a first visit"
status: draft
---
# The web app opens quickly on a first visit

## Outcome

Opening LevApp in a browser no longer means a long wait on a blank page: a visitor downloads what the page in front of them needs, and the rest arrives in the background, so the next screen is still instant (PAD-571). The iPhone app ships its code inside it and is not affected.

- The first page downloads its own code and what every page shares, not every screen.
- After a signed-in user's first screen appears, the menu's screens download in the background, so the first visit to each does not wait for its code.
- A user with the app open across a deploy is moved onto the new version: a missing piece of the old one makes the app reload itself once. If the piece is still missing after that reload, the screen fails; there is no error screen for that case yet.
- Portuguese ships with the app. English is downloaded only for a user who reads in English, and is in place before any screen switches to it.
- A check that runs on every frontend change fails if the first download grows past its budget.
- The web app and the staff console serve their own typefaces: no page asks Google for a font, before or after the cookie answer (PAD-635).

It does not promise server compression or cache headers, the iPhone app's launch time, or any change to what a screen shows.
