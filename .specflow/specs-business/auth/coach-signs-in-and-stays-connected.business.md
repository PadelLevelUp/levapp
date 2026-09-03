---
id: auth.coach-signs-in-and-stays-connected
status: implemented
implemented_by:
  - ../../specs/auth/login.spec.md
  - ../../specs/auth/logout.spec.md
  - ../../specs/auth/token-refresh.spec.md
  - ../../specs/auth/push-subscription.spec.md
---

# Coach signs in and stays connected

## Outcome

Once a coach (or player) has an account, they can sign in with their username and password and stay
signed in for weeks without being nagged to log back in, because the app quietly renews their session
in the background. While signed in, the app can also reach them with push notifications on their
phone or browser, and they can end the session cleanly from any device.

## Who This Is For

Any signed-up user of the app — coaches running their day-to-day schedule, and players checking their
own classes and profile. The journey is identical for both roles; what differs is what they see once
inside (covered by other domains).

## User Journey

1. The user opens the app and enters their username (or email) and password.
2. On success, the app stores an access token and takes them to their home screen.
3. As they keep using the app over the following days and weeks, the app silently exchanges their
   token for a fresh one behind the scenes — they are never forced to log in again just because time
   passed.
4. On their phone or in the browser, they can opt in to push notifications; the app registers their
   device so reminders and updates can reach them even when the app isn't open.
5. When they choose to sign out (or switch accounts on a shared device), the app invalidates the
   session immediately — that token can't be reused, even if someone gets hold of it afterward.

## Business Rules

- A username/password pair is required to sign in; wrong credentials or an account that hasn't been
  activated yet are both refused.
- A session lasts up to 30 days of token life, but is silently renewed well before it would expire, so
  in practice an active user is never logged out by the passage of time alone.
- Signing out immediately kills that specific session — the same token can't be replayed afterward.
- A device can register for push notifications only while the session is valid; each user has at most
  one push registration per app, so re-registering (e.g. after reinstalling) replaces the old one
  rather than piling up stale registrations.

## Success Metrics

Not yet measured. No login-success-rate, session-length, or push-opt-in dashboards exist in the
codebase today.

## Out of Scope

- Creating an account in the first place, and completing/activating a freshly created one — see
  [[auth.newcomer-creates-and-activates-an-account]].
- What a signed-in coach vs. a signed-in student actually sees once inside the app (role-based access)
  — see `settings.role-scope` and [[settings.coach-configures-preferences-and-access]].
- Rate limiting or lockout after repeated failed login attempts — not implemented (see Notes on the
  underlying dev spec).

## Notes

OPEN: login has no rate limiting or account lockout after failed attempts. That's a gap noted in the
underlying `auth.login` dev spec, not a business rule to document as if it existed.
