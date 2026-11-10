---
id: P-TRAINING-1
title: "Coach builds an exercise library"
status: implemented
---
# Coach builds an exercise library

## Outcome

A coach builds a personal library of padel exercises, each with a type, a difficulty and a court diagram, and organises them into named groups.

- Every exercise and group has one owning coach, who alone can change or delete it. A coach recorded as a follower can read it; no screen grants that role today.
- A court diagram is a starting position (Team A and Team B players, a feeder, cones, loose balls, pen strokes) and an ordered list of steps; each step has ordered ball paths (numbered when more than one) and any number of player movements. Diagrams from before the tactical board keep working and are upgraded silently on their next edit.
- Within a step, actions play in the order drawn: the ball goes first, then the player runs to it. Players moving at the same moment move together, a player can make several runs in a step, and the coach can watch slow, normal or fast. Exercises saved before this ordering play as before (PAD-309, PAD-310, PAD-311).
- An exercise can be in several groups.
- Managing exercises and groups is coach-only; a student is refused outright, never with a server error.

It does not promise using exercises in a specific class.
