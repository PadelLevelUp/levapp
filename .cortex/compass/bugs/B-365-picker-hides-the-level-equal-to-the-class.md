---
id: B-365
title: "Participant picker hid a student's level when it equalled the class's level"
type: incomplete-rule
severity: low
status: resolved
resolved: 2026-10-07T22:57:21Z
affects:
  - classes.create
  - classes.edit
  - frontend/apps/web/src/components/calendar/PlayerSelector.tsx
  - frontend/apps/mobile/src/features/calendar/player-selector.tsx
proposed_fix: "Show the level chip for every student who has a level: primary for the class's level, amber for another or none, neutral when the class has no level (classLevelMatch, one rule for web and iOS)."
opened: 2026-10-07T22:57:21Z
---

# B-365 — The picker hid the level equal to the class's

**Source:** PAD-527 (Discord). Id in Session-D's range, numbering unconfirmed.

**What happened:** both pickers rendered the level chip only for an out-of-level student, so a
student at the class's own level showed no level at all; the coach could not tell "same level"
from "no information".

**Reproduced:** the new render tests (web `PlayerSelector.test.tsx`, iOS `player-selector.test.tsx`)
fail on the unpatched pickers, 2 of 2 each.

**Root cause (type 2, incomplete rule):** `classes.create` rule 10 asked only for "a mark on any
student outside the class's level" and said nothing about showing the level otherwise.

### Resolution
Rule 10 now says every student's level is visible, coloured by the class's level, with a criterion;
`@levelup/config` `classLevelMatch` is the one rule; iOS `isOutOfLevel` delegates to it.
