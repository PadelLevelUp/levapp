---
id: client.user-returns-to-a-screen-at-once
status: draft
implemented_by:
  - ../../specs/client/query-cache.spec.md
---

# A user returns to a screen and sees it at once

## Outcome

Moving around the app stops feeling like loading the app again. A coach who looks at the
calendar, opens the students list, and comes back to the calendar sees it immediately as they
left it; if something changed meanwhile, the screen updates quietly without a blank page or a
spinner in between. The same is true on the phone app. Today every return re-downloads the
screen and shows a skeleton first (PAD-571 speed study, cause 2).

## Who This Is For

Coaches first: they switch between calendar, students, presences and messages many times a
session. Students on their home, class and messages screens. Both apps.

## User Journey

1. A coach opens the calendar; it loads once.
2. They open the students list, then come straight back to the calendar: it is there at once,
   nothing reloads.
3. A minute later they come back again: it is there at once, and a moment later it refreshes in
   the background; nothing flickers.
4. A student sends them a message meanwhile: the unread badge and the messages list update as
   it happens, as they do today.
5. They move the calendar one week forward: the current week stays on screen until the next
   one has arrived.

## Business Rules

1. A screen seen in the last minute comes back from memory with no request; after a minute it
   comes back from memory and refreshes in the background.
2. Changes made in the app (a new class, a confirmed presence, a sent message) and changes that
   arrive live (messages, invitations, requests) still show at once; the cache never hides them.
3. The web app and the phone app follow the same rule, so a coach using both sees the same
   freshness.
4. Nothing new is sent to the server to keep screens fresh: no polling, no background timers.

## Success Metrics

- Returning to a screen seen in the last minute makes zero requests for its data (web: counted
  by Playwright across a navigation; backend: unchanged statement counts in the baseline).
- The shared roster and levels are downloaded once per minute at most, not once per screen.

## Out of Scope

- Offline use and a persisted cache across app launches (a later leaf; PAD-587 on mobile
  measures the cold start separately).
- Changing what any screen shows.

## Notes

- Decided 2026-10-10 between Session E (PAD-586, web) and Session D (PAD-592, mobile) under the
  wave-14 coordinator: one stale window of a minute for both apps.
