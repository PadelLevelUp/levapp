---
id: attendance.player-confirms-and-manages-attendance
status: implemented
implemented_by:
  - ../../specs/attendance/presence.spec.md
  - ../../specs/attendance/confirm.spec.md
---

# Player Confirms And Manages Attendance

## Outcome

When a player is invited to a class, they can confirm or decline, and even after confirming,
cancel their spot up until the class starts — with the system distinguishing an early, no-fuss
cancellation from a late one, and always telling the coach when it happens.

## Who This Is For

Students/players responding to and managing their own attendance; the coach, who is notified.

## User Journey

1. A player enrolled in a class is automatically marked as invited when the occurrence is
   created.
2. They respond to a reminder — yes, I'll attend, or no, I can't.
3. Having confirmed, they can still change their mind and cancel any time before the class
   starts.
4. If they cancel close to the class's start (inside the coach's cancellation-deadline window),
   it's still allowed but flagged as a late cancellation.
5. If a player knows well in advance they can't make it, they can proactively decline before
   they'd even normally be asked — this doesn't count against them as a late cancellation and
   immediately frees the spot for someone else. This works for any future class on their
   calendar, however far ahead, including a class the app has not yet opened for reminders and a
   class the player booked through their own request (PAD-288, PAD-282).
6. Either way, the coach is notified by name, with the class identified, and told whether it was
   a late or proactive cancellation.

## Business Rules

- Every enrolled player starts a class occurrence "invited but not yet confirmed."
- A confirmed player can cancel any time before the class actually starts — never after.
- A cancellation inside the coach's configured deadline window (default 24 hours before start) is
  still allowed, just flagged as late.
- A decline made before the moment the player would normally be reminded is a "proactive"
  decline — it is never flagged late, and it frees the spot immediately rather than waiting for
  the invitation engine's next cycle.
- A player can cancel any future class on their calendar, not only the ones already being
  reminded about; the app opens the occurrence for them if it has not been opened yet, and only
  for a player who is actually in that class.
- Cancelling, by any route, always frees the spot the same way a reminder decline does, so the
  invitation engine treats it identically no matter which door the player walked through.
- The coach gets exactly one notification per cancellation, naming the student and the class, and
  marked clearly if it was late.

## Success Metrics

Not yet measured.

## Out of Scope

How the freed spot then gets filled — invitations, waiting list, or a join request
(`notifications` and `classes` domains); the coach's own final record of who actually attended
(`attendance.coach-finalizes-attendance-records`).

## Notes

- Early cancellation on a not-yet-opened occurrence: owner decision of 2026-09-11 (materialise on
  demand), recorded in `.cortex/atlas/decisions/2026-09-11-per-occurrence-enrolment-source-of-truth.md`.
