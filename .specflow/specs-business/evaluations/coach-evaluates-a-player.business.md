---
id: evaluations.coach-evaluates-a-player
status: implemented
implemented_by:
  - ../../specs/evaluations/categories.spec.md
  - ../../specs/evaluations/entries.spec.md
  - ../../specs/evaluations/player-view.spec.md
  - ../../specs/evaluations/bulk-import.spec.md
---

# Coach Evaluates A Player

## Outcome

A coach defines their own scoring categories (like Forehand, Volley, Serve), records scores for
players over time in those categories, and can see each player's evaluation history as a chart on
their profile — including scores brought in through a bulk data import.

## Who This Is For

Coaches recording evaluations; students/players seeing their own scores on their profile.

## User Journey

1. The coach sets up custom evaluation categories with a name and a scoring scale (e.g. 1-10).
2. During or after a session, the coach records a score and an optional comment for a player in
   one of those categories.
3. Opening a player's profile, the coach (and the player) sees the current score in each category
   and a chart of how it's changed over time.
4. When importing player data in bulk, past evaluation scores come in along with everything else,
   linked to the right player and category.

## Business Rules

- Evaluation categories belong to the coach who created them, each with its own scoring scale.
- A player can be scored in a category more than once over time; the player's profile always
  shows the latest score per category.
- A recorded score must fall within its category's defined scale.
- Bulk-imported evaluations are created the same way as ones entered by hand — same entities,
  same rules.

## Success Metrics

Not yet measured.

## Out of Scope

The general player-data import flow itself, beyond evaluation entries (`import` domain).

## Notes

None.
