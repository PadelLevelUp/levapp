---
about: All lessons belong to a club
permanence: changing
verified: "2026-11-25 (observed)"
origin:
  - migrated:compass/rules/R-003-club-scoped-lessons.md@ef7a5f3
  - person:owner@2026-11-25
  - report:docs/plans/2026-11-13-pad-835-analysis.md
aliases:
  - R-003
  - R-003-club-scoped-lessons
applies_when: "When the agent does work this rule governs: all lessons belong to a club"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/services/**/*.py", "backend/padel_app/models/**/*.py"] }
source: user@2026-09-03
---

# R-003 — All lessons belong to a club

`lessons.club_id` (NOT NULL, CASCADE): a lesson always belongs to one club. Player and calendar queries are per coach, across every club the coach belongs to, and each class shows its own club; do not filter them by the coach's current club. The current club (the most recently joined, CLUBS-CRUD-3) is only what a club-scoped write uses when it is given no club: create or clone a class, add a player, the join token, import.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence. Until 2026-11-25 the text said player and calendar queries were filtered by the current club. The code never did that (the PAD-835 analysis of 2026-11-13: the calendar reads have no club filter, the roster is `coach.players`), and a coach with two clubs needs one calendar and one roster, so the owner had the text corrected (2026-11-25, "Text fix now, wait for a coach"). Choosing the club per write waits for a real coach with two clubs.

<!-- 3.x fields of compass/rules/R-003-club-scoped-lessons.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
