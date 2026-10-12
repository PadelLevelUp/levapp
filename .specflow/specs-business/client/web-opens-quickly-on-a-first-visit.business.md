---
id: client.web-opens-quickly-on-a-first-visit
status: draft
implemented_by:
  - ../../specs/client/route-loading.spec.md
---

# The web app opens quickly on a first visit

## Outcome

Opening LevApp in a browser stops meaning a long wait on a blank page. Today every visitor
downloads the whole app, every screen including ones they will never open, before seeing anything
(one 2.4 MB file; PAD-571 speed study, cause 1). After this, a visitor downloads what the page in
front of them needs, and the rest arrives quietly in the background, so moving to the next screen
is still instant.

## Who This Is For

Everyone who opens the web app: a coach on a club's Wi-Fi, a student following an invite link on
a phone's mobile data, a visitor reading the landing page. The iPhone app is not affected: its
code ships inside the app, so there is nothing to download when it opens.

## User Journey

1. A student taps an invite link on mobile data; the invite page appears after a fraction of the
   download it needs today.
2. A coach signs in; the dashboard appears, and while they read it the other screens download in
   the background.
3. The coach opens the calendar a few seconds later; it opens at once, as it does today.
4. LevApp deploys a new version while the coach has the app open; the next screen they open
   loads the new version instead of failing.

## Business Rules

1. The first page a visitor opens downloads the code for that page and what every page shares,
   not every screen of the app.
2. After a signed-in user's first screen appears, the screens of the app's menu download in the
   background, so the first visit to each of them shows no wait.
3. A user who has the app open across a deploy never sees a broken screen: a missing piece of
   the old version makes the app reload itself once, onto the new one.
4. A visitor downloads the language they see; the other language arrives only when chosen.
5. The web app's build fails if the first download grows past its budget, so the gain cannot
   erode silently.
6. The web app and the staff console serve their own typefaces: opening any page tells no third
   party about the visit, before the visitor has answered the cookie banner or after (PAD-635).

## Success Metrics

- The code a first visit downloads (gzip) drops from 674 kB (one file, at faa4e721f) to the
  budget the dev spec names, measured by the build.
- The build has no "chunks larger than 500 kB" warning.

## Out of Scope

- The server's compression and cache headers (PAD-584).
- The iPhone app's launch time (PAD-587).
- Changing what any screen shows.

## Notes

- Web-only by nature (R-024 exception): an iPhone app has no download step to split. Recorded
  in the dev spec and the PR body.
