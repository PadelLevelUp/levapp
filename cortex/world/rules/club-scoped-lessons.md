---
about: All lessons belong to a club
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-003-club-scoped-lessons.md@ef7a5f3
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

`lessons.club_id` (CASCADE). Player and calendar queries are filtered by the coach's current club.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-003-club-scoped-lessons.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
