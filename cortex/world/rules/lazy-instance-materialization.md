---
about: Recurring lessons never pre-create instance rows
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-001-lazy-instance-materialization.md@ef7a5f3
aliases:
  - R-001
  - R-001-lazy-instance-materialization
applies_when: "When the agent does work this rule governs: recurring lessons never pre-create instance rows"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/services/**/*.py", "backend/padel_app/modules/**/*.py"] }
source: user@2026-09-03
---

# R-001 — Recurring lessons never pre-create instance rows

Instances are created on demand via `get_or_materialize_instance()`. Always go through this function; never create a `LessonInstance` directly for a recurring lesson.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-001-lazy-instance-materialization.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
