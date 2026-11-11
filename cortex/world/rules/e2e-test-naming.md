---
about: "E2E tests are named `\"US-XXX: description\"`"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-021-e2e-test-naming.md@ef7a5f3
aliases:
  - R-021
  - R-021-e2e-test-naming
applies_when: "When the agent does work this rule governs: e2E tests are named `\"US-XXX: description\"`"
scope:
  - action
match: { commands: [], paths: ["frontend/apps/web/e2e/**/*.ts"] }
source: user@2026-09-03
---

# R-021 — E2E tests are named `"US-XXX: description"`

Traceability from a failing spec back to the user story / ticket.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-021-e2e-test-naming.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
