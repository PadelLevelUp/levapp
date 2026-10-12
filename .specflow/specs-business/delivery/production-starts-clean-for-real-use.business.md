---
id: delivery.production-starts-clean-for-real-use
status: draft
implemented_by:
  - ../../specs/delivery/production-activity-reset.spec.md
---

# Production starts clean for real use

## Outcome

Before coaches start using LevApp for real, production is cleared of the trial period's activity:
every chat, notification, invitation, waiting list, attendance record and evaluation from the trial
is gone. Every account, club, class, series roster and student level stays, so nobody has to sign
up or set anything up again (owner request, PAD-632, 2026-10-11).

## Who This Is For

The owner, who opens the app to real use with a clean history; coaches and students, who keep their
accounts, classes and levels and see no leftover trial messages.

## User Journey

1. The owner takes a backup and gives the go.
2. The clean-up runs once, as one step that either completes entirely or changes nothing.
3. Coaches and students sign in as before: their classes, rosters and levels are where they were;
   chats, notifications and history start empty; upcoming classes keep everyone already booked.
4. Messaging, reminders and invitations work from the first new action, with no step needed.

## Business Rules

- Accounts, clubs, courts, classes, series rosters, upcoming bookings, levels, categories, coach
  notes, invitations and join links all stay.
- A student's current level never changes; only the record of past level changes is cleared.
- The App Store reviewer's demo coach and its student keep everything while the review is open.
- The clean-up can be rehearsed: a dry run reports what it would remove and changes nothing.
- Nothing from the trial is sent again after the clean-up: no reminder, invitation or message is
  repeated because its history was removed.

## Success Metrics

- After the clean-up: zero trial messages, notifications and attendance records outside the demo
  coach; the same number of accounts, classes and upcoming bookings as before.

## Out of Scope

- Deleting accounts, classes or anything the owner asked to keep.
- Running the clean-up itself: the owner's operator runs it after a backup.

## Notes

- Rehearsed on a copy of staging (itself a copy of production) on 2026-10-11 (PAD-632).
