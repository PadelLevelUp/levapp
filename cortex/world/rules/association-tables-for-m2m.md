---
about: "Many-to-many relationships use explicit association tables with an `id` primary key"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-004-association-tables-for-m2m.md@ef7a5f3
aliases:
  - R-004
  - R-004-association-tables-for-m2m
applies_when: "When the agent does work this rule governs: many-to-many relationships use explicit association tables with an `id` primary key"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/models/**/*.py", "backend/migrations/versions/*.py"] }
source: user@2026-09-03
---

# R-004 — Many-to-many relationships use explicit association tables with an `id` primary key

Not bare composite keys — the tables routinely carry extra fields (`coach_in_player.side`, `coach_exercise.role`).

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-004-association-tables-for-m2m.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
