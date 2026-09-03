---
id: players.coach-browses-and-reviews-roster
status: implemented
implemented_by:
  - ../../specs/players/list.spec.md
  - ../../specs/players/profile.spec.md
  - ../../specs/players/notes.spec.md
  - ../../specs/players/level-history.spec.md
---

# Coach browses and reviews their roster

## Outcome

A coach can find any student on their roster — by name, by missing setup (no level, no side set) — and
then open that student's profile to see the full picture: current level, evaluation scores, notes on
what they're good at and what they need to work on, and how their level has changed over time. This is
the coach's day-to-day view into "who is this player, and where are they at."

## Who This Is For

Coaches reviewing their own roster and their own students. Nothing here is visible to another coach or
to the student themselves.

## User Journey

1. The coach opens their player list and can search by name, sort by name or level, and filter down to
   players missing a level or a side preference — useful for spotting incomplete setups.
2. The coach taps into a player and lands on that player's profile: name, current level, latest
   evaluation score per category, and the strengths/weaknesses notes the coach has written for them.
3. From the profile, the coach can add a strength or weakness note (short free text, tagged as one or
   the other) or delete one that no longer applies.
4. The coach can also see how the player's level has changed over time — every past assignment, most
   recent first.
5. From the profile, the coach can add the player straight into one of their upcoming classes for the
   week, picking from a week-by-week list of their own class instances; classes already full are shown
   but can't be picked.

## Business Rules

- Search, sort, and filter all operate only within the coach's own roster — never across coaches.
- A note is scoped to one specific coach-student relationship, tagged as either a strength or a
  weakness, and capped at 500 characters.
- A player's level history is a full log, not just the latest value — every assignment is kept, and
  "current level" always means the most recent one on record.
- The "add to a class" picker isn't filtered by the player's level — a coach can put any of their
  players into any of their own classes; capacity, not level, is what limits selection.
- Only a coach (not a student) can reach these roster views and actions — a caller with no coach
  profile is refused outright, never shown a broken or partial page.

## Success Metrics

Not yet measured. No dashboard exists for search usage, note volume, or add-to-class conversion.

## Out of Scope

- Creating a player or inviting one to complete their own profile — see
  [[players.coach-builds-roster]].
- Editing a player's stored details, or removing them from the roster — see
  [[players.coach-edits-player-details]].
- The evaluation scoring system itself (categories, how scores are entered) — see the evaluations
  domain.
- Scheduling and running the classes a player gets added to — see the classes/calendar domains.

## Notes

None.
