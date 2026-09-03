---
id: training.coach-builds-exercise-library
status: implemented
implemented_by:
  - ../../specs/training/exercises.spec.md
  - ../../specs/training/groups.spec.md
  - ../../specs/training/court-diagram.spec.md
  - ../../specs/training/exercise-view.spec.md
---

# Coach Builds Exercise Library

## Outcome

A coach builds a personal library of padel exercises — each with a type, a difficulty level, and
a visual court diagram showing player and equipment placement — and organizes them into named
groups for easier reuse, with the option to share access with other coaches.

## Who This Is For

Coaches building and maintaining their own exercise library.

## User Journey

1. The coach creates an exercise: a name, type (attack, defense, serve, etc.), difficulty from
   beginner to expert, and which player levels it targets.
2. Using a visual court editor, the coach places players, cones, balls, and movement arrows to
   diagram exactly how the exercise works.
3. The coach browses and filters their exercise library by type and difficulty.
4. Related exercises get organized into a named group — e.g. "Warm-Up Routine" — for quick reuse
   across lessons.
5. Another coach who's been given follower access to an exercise or group can see and use it, but
   only the owner can edit or delete it.

## Business Rules

- Every exercise and group has one owning coach; other coaches can be given read-only
  ("follower") access.
- An exercise's court diagram is a set of placed elements (players, cones, balls, arrows) with
  position and, for arrows, an end point.
- An exercise can belong to more than one group at once.
- Exercise and group management is coach-only — a student gets rejected outright, never a server
  error.

## Success Metrics

Not yet measured.

## Out of Scope

Using exercises within a specific class (`training.coach-plans-training-for-a-class`).

## Notes

None.
