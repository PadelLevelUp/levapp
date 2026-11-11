---
about: "`player_level_history` is append-only"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-019-level-history-append-only.md@ef7a5f3
aliases:
  - R-019
  - R-019-level-history-append-only
applies_when: "When the agent does work this rule governs: `player_level_history` is append-only"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/services/**/*.py"] }
source: user@2026-09-03
---

# R-019 — `player_level_history` is append-only

Rows are never updated or deleted; `player.level` is the latest by `assigned_at`.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-019-level-history-append-only.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
