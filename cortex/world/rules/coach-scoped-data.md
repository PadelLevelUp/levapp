---
about: Levels, evaluation categories, exercises, notification config and player notes are coach-scoped
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-002-coach-scoped-data.md@ef7a5f3
aliases:
  - R-002
  - R-002-coach-scoped-data
applies_when: "When the agent does work this rule governs: levels, evaluation categories, exercises, notification config and player notes are coach-scoped"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/services/**/*.py", "backend/padel_app/models/**/*.py"] }
source: user@2026-09-03
---

# R-002 — Levels, evaluation categories, exercises, notification config and player notes are coach-scoped

A coach only sees their own data. The same player can carry different levels and evaluations from different coaches.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-002-coach-scoped-data.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
