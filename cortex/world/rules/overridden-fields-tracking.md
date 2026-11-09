---
about: "Editing an instance that diverges from its parent lesson records the diverging fields in `overridden_fields`"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-020-overridden-fields-tracking.md@ef7a5f3
aliases:
  - R-020
  - R-020-overridden-fields-tracking
applies_when: "When the agent does work this rule governs: editing an instance that diverges from its parent lesson records the diverging fields in `overridden_fields`"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/services/**/*.py", "frontend/apps/web/src/**/*.tsx"] }
source: user@2026-09-03
---

# R-020 — Editing an instance that diverges from its parent lesson records the diverging fields in `overridden_fields`

This JSON is how the frontend distinguishes custom from inherited values.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-020-overridden-fields-tracking.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
