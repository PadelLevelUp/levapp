---
id: dashboard.user-relies-on-the-dashboard
status: implemented
implemented_by:
  - ../../specs/dashboard/blocks.spec.md
  - ../../specs/dashboard/navigation.spec.md
---

# User relies on the dashboard

## Outcome

The moment a coach or student opens the app, they land on a dashboard built for their role — a set
of at-a-glance blocks summarizing what needs their attention right now: unread messages, upcoming
classes, key numbers, recent notification activity. Every piece of it is clickable through to the
exact place it's describing, so the dashboard is a jumping-off point, not a dead end.

## Who This Is For

Every coach and every student, as the first screen they see on opening the app.

## User Journey

1. A coach opens the app and lands on their dashboard: how many unread conversations need a reply,
   key numbers (total players, this week's classes, attendance rate), their upcoming classes, and
   recent notification activity.
2. A student opens the app and sees their own version, in the same look and layout as the
   coach's: a greeting, their next class front and centre, a short queue of things waiting on
   them (invites to confirm, messages to answer), their upcoming classes for the next month —
   with a Yes / No right on any class they have been asked to confirm, so answering never means
   hunting for the message — and their own key numbers (lessons attended and missed, each
   against their total). Answering on the dashboard also clears that reminder's unread mark.
3. The coach clicks an unread-messages block and lands directly in Messages.
4. The coach clicks an upcoming class and lands on the calendar already showing the right week,
   with that exact class's details already open — no hunting through weeks to find it.
4a. A coach who cannot deal with a half-empty class right now presses "Later" on its card; it
   drops out of the queue until tomorrow and the queue count follows, so the list stays honest.
5. A student clicks their "Missed" count and lands on their absence history; clicking "Attended"
   lands on their attendance history.
6. A card that has nowhere sensible to send them — because no such page exists yet — is shown as a
   plain, non-interactive number, never as a dead link to a broken page.

## Business Rules

- The dashboard is server-driven: an ordered set of blocks, each with its own type, assembled per
  request for the specific user asking.
- A coach and a student see meaningfully different dashboards, built for what each role actually
  needs to act on — but in one shared visual language, so the app never looks like two apps
  depending on who signed in.
- An invite the student has not answered is shown as something to resolve, not merely counted.
  That includes the time-critical asks that arrive through chat — "a spot opened, want it?" and
  "want to join the waiting list?" — answered right there with the same Yes/No, once, in one
  place: answering on the dashboard settles the chat message and vice versa.
- A number on the dashboard agrees with the list next to it: a student's "upcoming lessons" is
  how many classes are on their schedule, whether or not they have answered the reminder yet.
- A coach can push a "class still has room" card back with "Later": it leaves their queue for a
  day, on every device they use, and comes back on its own. The class itself is untouched.
- Every clickable card leads to a real, working destination — a card is never made clickable unless
  a matching page actually exists to receive the click.
- The "classes to validate" number a coach sees on the dashboard is the same number the Presences
  tab shows when the card opens it — one count, in classes, for one week — so the coach never has
  to work out which of two figures is the real one. When this week has nothing left, the card
  shows last week's backlog and opens the tab on last week.
- Clicking an upcoming class always opens that exact occurrence's details already in view — never a
  bare calendar the user then has to search through.
- "Tomorrow" and other day-relative counts on the dashboard are always the coach's own local
  calendar day, not a server-clock approximation that could drift across the actual midnight the
  coach experiences.

## Success Metrics

Not yet measured.

## Out of Scope

- The content and behavior of the pages a dashboard card links to (Messages, Calendar, attendance
  history) — those live in their own domains; this outcome only covers assembling the dashboard and
  getting the user to the right place.

## Notes
- None.
