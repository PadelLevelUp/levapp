---
id: P-AUTH-2
title: "Coach signs in and stays connected"
status: implemented
---
# Coach signs in and stays connected

## Outcome

A user with an account signs in with username and password and stays signed in for weeks, because the app renews the session quietly. While signed in, the app can push to their phone or browser, and they can end the session cleanly from any device. Coaches and players follow the same journey.

- Sign-in needs a username and password; wrong credentials and a not-yet-activated account are refused. An empty password never signs anyone in, by any route: the app's sign-in is the only way in with a password.
- A session's token lives up to 30 days and is renewed well before it expires, so an active user is never logged out by time alone.
- Signing out kills that session at once; the token cannot be replayed.
- A device registers for push only while the session is valid, with at most one registration per user per app: re-registering replaces the old one.

It does not promise account creation or activation, what each role sees inside, or rate limiting or lockout after failed sign-ins, which do not exist.
