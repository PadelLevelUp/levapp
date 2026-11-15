---
about: Tests import service functions inside the test body
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-006-import-services-inside-tests.md@ef7a5f3
aliases:
  - R-006
  - R-006-import-services-inside-tests
applies_when: "When the agent does work this rule governs: tests import service functions inside the test body"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/tests/**/*.py"] }
source: user@2026-09-03
---

# R-006 — Tests import service functions inside the test body

Module-top imports of services create circular imports in the test suite.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-006-import-services-inside-tests.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
