---
id: delivery.a-release-never-drops-a-request
status: draft
implemented_by:
  - ../../specs/delivery/zero-downtime-deploy.spec.md
---

# A release never drops a request

## Outcome

Shipping a new version stops interrupting people who are using the app. Today every production
release stops the server before the new one starts, so for some seconds every request, and every
live connection that reconnects, gets an error (PAD-571 speed study, cause 4; about thirty releases
a month). After this, the new version starts next to the old one and takes over only once it is
ready, and reminders are never sent twice while both run.

## Who This Is For

Coaches and students using the app at the moment of a release; the owner, who can release during
the day without choosing a quiet minute.

## User Journey

1. A coach is confirming presences when a release goes out.
2. The new version starts beside the old one; the coach's requests keep being answered.
3. Once the new version answers its health check, the old one stops; live updates reconnect to
   the new one by themselves.
4. Every reminder due in those seconds is sent exactly once.

## Business Rules

1. A release never answers a user's request with a server error because the server is restarting.
2. Only one running version sends scheduled reminders at any moment.
3. A database change that the previous version cannot work with is released with a short,
   announced stop instead (chosen by hand).
4. A slow database change does not take the app down: the change runs while the current version
   keeps serving, and a version whose database has not been brought up to date never starts
   taking requests (PAD-691, PAD-696).

## Success Metrics

- No 502 responses during a staging release, sampled every half second.
- No reminder sent twice across a release.

## Out of Scope

- Running more than one copy of the server permanently (R-027; needs a shared broker).
