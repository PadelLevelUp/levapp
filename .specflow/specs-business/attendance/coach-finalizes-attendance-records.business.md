---
id: attendance.coach-finalizes-attendance-records
status: draft
implemented_by:
  - ../../specs/attendance/validation.spec.md
  - ../../specs/attendance/stats.spec.md
---

# Coach Finalizes Attendance Records

## Outcome

After a class has run, the coach has one place to review who showed up and lock in the official
attendance record for it — pre-filled from however each player responded — instead of opening
every class's detail sheet one at a time; the same underlying numbers also feed the metrics the
notification system uses to judge which players to prioritize for open spots.

## Who This Is For

Coaches finalizing attendance for classes that have already happened.

## User Journey

1. After a class ends, it shows up in the coach's Presences tab, pre-filled with each player's
   status based on how they responded (confirmed → present, declined → absent/justified, no
   answer → undecided).
2. If everyone answered, the coach can validate the class in one action, locking in the record.
3. If someone never answered, that class is held back — the coach has to decide for that player
   before it can be validated.
4. The coach can add a walk-in — someone who showed up without being on the roster — directly to
   a past class, marked present.
5. Validating isn't final forever: the coach can undo it and re-validate later without losing
   anything already recorded.
6. Behind the scenes, the same attendance and absence numbers feed the metrics used to rank and
   restrict players for the automatic invitation system.

## Business Rules

- Only classes that have already ended can be validated; future classes never appear here.
- A class can't be validated while any enrolled player is still undecided — the system pre-fills
  a best guess from their response, but nothing is written until the coach confirms.
- A player who never answers defaults, for display only, to "absent, justified" — a generous
  guess the coach can always downgrade — because it's the safe default for their eligibility
  standing.
- Validating a batch of classes only locks in the ones that are actually ready; the rest stay in
  the list with an explanation.
- A walk-in added to a past class occupies a real seat in the class's capacity, not just an
  attendance note.
- Undoing a validation reopens the record for editing — it never erases what was already
  recorded.
- A coach only ever sees their own classes and players here — never another coach's roster.

## Success Metrics

Not yet measured.

## Out of Scope

The player-side confirm/decline/cancel flow before a class runs
(`attendance.player-confirms-and-manages-attendance`); browsing history/absence charts
(`attendance.student-tracks-attendance-and-absence-history`).

## Notes

OPEN: `attendance.stats` (the raw attendance-rate / unjustified-absence calculations that feed
the notification engine's ranking and restriction logic) is grouped here because it shares the
same underlying `Presence` data as validation, even though it has no UI of its own and isn't
something a coach directly "does." If a future business spec covers the invitation/eligibility
engine's ranking logic end-to-end, `attendance.stats` might fit better there instead.

- **[DEC 2026-09-04, PAD-166]** iOS gets full reporting parity with web's Presences tab: the
  attendance charts, CSV export, table filters/column chooser, and the academy/private breakdown
  — decided to build rather than treat as desktop-only. See `attendance.validation` Notes.
