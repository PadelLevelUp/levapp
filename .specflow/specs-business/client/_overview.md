# client — Client Data Runtime

## What this is

What coaches and students experience when they move between screens: whether a screen they
just saw comes back at once, and how fresh what they see is.

## What it covers

- `client.user-returns-to-a-screen-at-once` — a screen seen a moment ago shows again instantly
  and quietly refreshes; anything that changes on the server reaches the screen as it happens.

## Why it's grouped this way

It is one promise about every screen rather than a feature of any one of them, so it lives in
its own small domain, for the web app and the iPhone app alike.
