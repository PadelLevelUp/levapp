---
about: "Business logic lives in `padel_app/services/`; route handlers stay thin"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-005-services-layer.md@ef7a5f3
aliases:
  - R-005
  - R-005-services-layer
applies_when: "When the agent does work this rule governs: business logic lives in `padel_app/services/`; route handlers stay thin"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/modules/**/*.py"] }
source: user@2026-09-03
---

# R-005 — Business logic lives in `padel_app/services/`; route handlers stay thin

A handler in `modules/` calls the service and returns the result. Never put business logic in a route handler.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-005-services-layer.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
