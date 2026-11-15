---
about: "All HTTP calls go through `@levelup/api`; never call axios from a component or screen"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-012-api-through-levelup-api.md@ef7a5f3
aliases:
  - R-012
  - R-012-api-through-levelup-api
applies_when: "When the agent does work this rule governs: all HTTP calls go through `@levelup/api`; never call axios from a component or screen"
scope:
  - action
match: { commands: [], paths: ["frontend/apps/web/src/**/*.tsx", "frontend/apps/mobile/src/**/*.tsx", "frontend/apps/mobile/app/**/*.tsx"] }
source: user@2026-09-03
---

# R-012 — All HTTP calls go through `@levelup/api`; never call axios from a component or screen

The shared client injects base URL and token storage per shell; a direct axios call bypasses auth refresh and breaks the web/mobile parity rule.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-012-api-through-levelup-api.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
