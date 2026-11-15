# levels

## What this is

Business outcomes for the levels domain: the coach-defined skill ladder used to categorize players
and match them to classes.

## What it covers

- `levels.coach-defines-and-assigns-skill-ladder` — building a per-coach level ladder and placing
  players on it.

## Why it's grouped this way

Both leaves (coach-levels, player-assignment) are two halves of one outcome — defining the ladder is
meaningless without assigning players to it, and assignment has no meaning without a ladder to assign
from — so this 2-leaf domain gets a single business spec per the sizing guidance.
