# attendance

## What this is

Business outcomes for the attendance domain: a player's own confirm/cancel loop, a student's
review of their history, and a coach's finalized record-keeping.

## What it covers

- `attendance.player-confirms-and-manages-attendance` — a player confirming, declining, or
  cancelling their spot in a class, including the proactive-decline and late-cancellation
  distinctions.
- `attendance.student-tracks-attendance-and-absence-history` — a student's (or coach's, for a
  roster player) chart-and-list view of attended and missed classes.
- `attendance.coach-finalizes-attendance-records` — the coach's after-the-fact validation
  workflow that locks in the official record, plus the stats it feeds downstream.

## Why it's grouped this way

These three outcomes follow the attendance lifecycle in order: a player's pre-class response,
the student's own after-the-fact view of it, and the coach's authoritative finalization of it.
`stats` is grouped with validation rather than given its own spec since it has no independent
user-facing surface — see the OPEN note on that spec.
