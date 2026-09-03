---
id: notifications.student-controls-their-notifications
status: implemented
implemented_by:
  - ../../specs/notifications/student-block-preferences.spec.md
---

# Student controls their notifications

## Outcome

A student who doesn't want to be pinged about open spots — because they're injured, traveling, or
simply not interested in extra classes right now — can say so once, from their own Settings, at
whichever level they need: skip automatic invites, skip manual invites, or skip everything
including reminders. Their coach can see that the student deliberately opted out (and why, if they
chose to say), instead of assuming they're being ignored. Direct messages, cancellation notices, and
"you got the spot" confirmations always still reach them — this is only about being asked.

## Who This Is For

A student who wants to stop receiving class-slot solicitations without leaving the platform or
missing important messages, and the coach who needs to understand why a normally-responsive student
has gone quiet on invites.

## User Journey

1. A student who's about to be away for a while opens Settings → Notifications on their own account.
2. They switch on "block automatic invitations" and, if they want to, type a short reason ("vou
   estar fora até setembro") so their coach isn't left guessing.
3. From then on, the automatic invitation engine simply never considers them a candidate — no
   invitation, no notification event, nothing to decline.
4. If they want to stop absolutely everything, including attendance reminders, they switch on
   "block all notifications" — which asks them to confirm first, since it also means an unconfirmed
   absence could be recorded as unjustified.
5. Their coach, looking at that student's record in Players management, sees a clear "notifications
   cut" signal along with the student's reason, rather than wondering why the student stopped
   answering.
6. The student can turn any of these back off just as easily, and nothing about their direct
   messages with the coach or class-cancellation notices is ever affected by these switches.

## Business Rules

- Three independent levels exist: skip automatic invitations, skip manual invitations, skip
  everything. A student can combine them however they like, and turning the broadest one on never
  silently flips the narrower ones.
- A coach manually inviting a blocked student never even creates an invitation for them — the coach
  sees that student called out as skipped, with their reason if they gave one, rather than the
  invitation silently failing to arrive.
- Blocking everything also silences reminders, and doing so requires the student to explicitly
  confirm — because it carries a real consequence: an unconfirmed absence can count as unjustified.
- Direct chat messages, class-cancellation notices, and "you got the spot" confirmations are never
  affected by any of these switches — silencing solicitations must never cut a student off from
  their coach.
- The reason a student gives is deliberately visible to their coach — unlike a calendar
  availability blocker, which stays private. It exists specifically so the coach can tell "chose
  not to be asked" apart from "isn't responding."
- These preferences live only in the student's own Settings — there's no shortcut for them on the
  calendar.

## Success Metrics

Not yet measured.

## Out of Scope

- Time-window availability blockers on the calendar (a student saying "not available Tuesday
  evenings") — a separate, unrelated mechanism in the `calendar` domain.
- Being added to a class outright from the waiting list without being asked first — that enrolment
  path isn't gated by these preferences at all.

## Notes

- Source ticket PAD-112.
