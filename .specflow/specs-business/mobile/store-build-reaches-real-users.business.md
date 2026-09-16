---
id: mobile.store-build-reaches-real-users
status: draft
implemented_by:
  - ../../specs/mobile/release-build-target.spec.md
---

# The Store Build Reaches Real Users

## Outcome

An iOS build meant for the App Store talks to the production server, every time, whoever runs
the build and whatever is set in their terminal. A build meant for testing on staging says so
on screen, so a founder or tester never mistakes it for the real app.

## Who This Is For

- **Coaches and students on the App Store app.** The work shipped since 24 August reaches them
  only through a build that talks to production.
- **Founders and testers on TestFlight.** Staging's data is replaced by a copy of production on
  every staging deploy (PAD-200), so anything they do in a staging build disappears. They need
  to see which server they are using.

## User Journey

1. Someone makes an iOS build and names what it is for: `production` or `staging`.
2. A production build cannot come out pointing anywhere else. If the finished app would talk to
   another server, or would not ask the server for open spots, the build stops before it can be
   uploaded.
3. A tester opens a staging build on TestFlight. The sign-in screen shows a strip naming the
   test server. Settings, in every build, shows the version, the build number and the server.

## Business Rules

1. The App Store app uses `levapp.app` (owner/coordinator decision, 2026-09-16).
   `padellevelup.com` keeps serving production for the App Store builds already installed; new
   builds do not use it.
2. What a build is for is decided by name when the build is made, not by the builder's
   environment.
3. A build that is not production shows its server where a tester looks first: the sign-in
   screen, and Settings.

## Success Metrics

- No build uploaded after this change talks to a server other than the one it was named for:
  checked in the finished app, not the source.
- A tester can tell a staging build from the production build without asking anyone.

## Out of Scope

- Submitting to the App Store: the owner decides (PAD-351 item 3 is a written plan).
- Android release builds (PAD-290): the same question comes up there, and the target table is
  written so Android can use it.
- The web app. It is served by the backend it calls (`/api` on the same host), so it cannot
  point at the wrong server.

## Notes

- OPEN: none.
