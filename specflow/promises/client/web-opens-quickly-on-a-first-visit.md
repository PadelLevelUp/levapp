---
id: P-CLIENT-2
title: "The web app opens quickly on a first visit"
status: draft
---
# The web app opens quickly on a first visit

## Outcome

Opening LevApp in a browser no longer means a long wait on a blank page: a visitor downloads what the page in front of them needs, and the rest arrives in the background, so the next screen is still instant (PAD-571). The iPhone app ships its code inside it and is not affected.

- The first page downloads its own code and what every page shares, not every screen.
- After a signed-in user's first screen appears, the menu's screens download in the background, so the first visit to each shows no wait.
- A user with the app open across a deploy never sees a broken screen: a missing piece of the old version makes the app reload itself once onto the new one.
- A visitor downloads the language they see; the other arrives only when chosen.
- The web build fails if the first download grows past its budget.
- The web app and the staff console serve their own typefaces: opening a page tells no third party about the visit, before or after the cookie answer (PAD-635).

It does not promise server compression or cache headers, the iPhone app's launch time, or any change to what a screen shows.
