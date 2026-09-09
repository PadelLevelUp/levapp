---
id: training.coach-builds-exercise-library
status: implemented
implemented_by:
  - ../../specs/training/exercises.spec.md
  - ../../specs/training/groups.spec.md
  - ../../specs/training/court-diagram.spec.md
  - ../../specs/training/exercise-view.spec.md
  - ../../specs/training/tactical-board.spec.md
provenance:
  - derives_from: archive/documents/treino-quadro-tatico-2026-09-08/extracted/requirements.md
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
2. On the tactical board ("Quadro Tático") the coach picks the kind of drill — a 2v2 game
   situation, a basket-feeding drill, or a free magnetic board — places players and cones,
   draws the ball's path (flat or lob) and each player's movement, and can add further steps
   so the drill plays back step by step or as an animation. Web and the iOS app show the same
   board.
3. The coach browses and filters their exercise library by type and difficulty.
4. Related exercises get organized into a named group — e.g. "Warm-Up Routine" — for quick reuse
   across lessons.
5. Another coach who's been given follower access to an exercise or group can see and use it, but
   only the owner can edit or delete it.

## Business Rules

- Every exercise and group has one owning coach; other coaches can be given read-only
  ("follower") access.
- An exercise's court diagram is a starting position (players in Team A / Team B, a feeder, cones,
  loose balls, pen strokes) plus an ordered list of steps; each step has at most one ball path and
  any number of player movements. Diagrams drawn before the tactical board keep working and are
  upgraded silently the next time they are edited.
- An exercise can belong to more than one group at once.
- Exercise and group management is coach-only — a student gets rejected outright, never a server
  error.

## Success Metrics

Not yet measured.

## Out of Scope

Using exercises within a specific class (`training.coach-plans-training-for-a-class`).

## Notes

- Visual source for the board: archive document `treino-quadro-tatico-2026-09-08`
  (Claude Design canvas, 2026-09-08). Delivered as a four-ticket wave; see
  `training.tactical-board` for the wave tags.
