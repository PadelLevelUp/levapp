---
about: The backend serialises API responses in camelCase
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-022-camelcase-api-responses.md@ef7a5f3
aliases:
  - R-022
  - R-022-camelcase-api-responses
applies_when: "When the agent does work this rule governs: the backend serialises API responses in camelCase"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/modules/**/*.py", "backend/padel_app/serializers/**/*.py", "frontend/packages/types/**/*.ts"] }
source: user@2026-09-03
---

# R-022 — The backend serialises API responses in camelCase

`startTime`, `maxPlayers`, `coachId`; the `@levelup/types` package mirrors it exactly.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-022-camelcase-api-responses.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
