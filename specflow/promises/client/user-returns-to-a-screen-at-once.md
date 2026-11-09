---
id: P-CLIENT-1
title: "A user returns to a screen and sees it at once"
status: draft
---
# A user returns to a screen and sees it at once

## Outcome

Moving around the app stops feeling like loading it again: a screen the user comes back to shows at once as they left it, and if something changed it updates quietly, with no blank page or spinner. The same holds in the phone app (PAD-571).

- A screen seen in the last minute comes back from memory with no request; after a minute it comes back from memory and refreshes in the background.
- Changes made in the app and changes that arrive live still show at once; the cache never hides them.
- The web app and the phone app follow the same rule.
- Nothing new is sent to the server to keep screens fresh: no polling, no background timers.
- On the phone, a coach can pull a list down to reload it, and the spinner always comes down: a reload that fails or gets no answer says so (PAD-786).
- A request the server never answers ends as an error after a short wait, in both apps (PAD-786).

It does not promise offline use, a cache kept across app launches, or any change to what a screen shows.
