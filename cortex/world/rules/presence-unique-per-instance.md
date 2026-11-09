---
about: "`(player_id, lesson_instance_id)` is unique on presences"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-018-presence-unique-per-instance.md@ef7a5f3
aliases:
  - R-018
  - R-018-presence-unique-per-instance
applies_when: "When the agent does work this rule governs: `(player_id, lesson_instance_id)` is unique on presences"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/models/**/*.py", "backend/padel_app/services/**/*.py"] }
source: user@2026-09-03
---

# R-018 — `(player_id, lesson_instance_id)` is unique on presences

Never create a second presence for the same player and instance; update the existing row.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-018-presence-unique-per-instance.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
