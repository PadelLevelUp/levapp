---
id: P-PLAYERS-1
title: "Coach browses and reviews their roster"
status: implemented
---
# Coach browses and reviews their roster

## Outcome

A coach finds any student on their roster, by name or by missing setup (no level, no side), and opens their profile: current level, evaluation scores, strength and weakness notes, and level over time. On a wide screen the coach reviews a player without losing their place in the list. Nothing here is visible to another coach or the student.

- Search, sort and filter work only within the coach's own roster.
- Finding a player works the same everywhere a coach types a name (PAD-665): accents and case do not matter, words can come in any order and middle names be skipped ("Rui Basto" finds "Rui Pedro Basto"), the start of each word is enough ("jo mor"), a small typo is forgiven, and the best match comes first. Who can appear on each screen is unchanged.
- A note belongs to one coach-student relationship, is tagged strength or weakness, and holds at most 500 characters.
- Level history is a full log; the current level is the most recent assignment.
- The "add to a class" picker is not filtered by level: capacity, not level, limits selection.
- Only a coach reaches these views and actions; a caller with no coach profile is refused outright.

It does not promise creating or inviting players, editing or removing them, the evaluation system, or scheduling classes.
