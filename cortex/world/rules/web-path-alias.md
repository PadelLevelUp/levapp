---
about: "Web imports use the `@/` alias, never relative `../../` paths"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-011-web-path-alias.md@ef7a5f3
aliases:
  - R-011
  - R-011-web-path-alias
applies_when: "When the agent does work this rule governs: web imports use the `@/` alias, never relative `../../` paths"
scope:
  - action
match: { commands: [], paths: ["frontend/apps/web/src/**/*.ts", "frontend/apps/web/src/**/*.tsx"] }
source: user@2026-09-03
---

# R-011 — Web imports use the `@/` alias, never relative `../../` paths

`@/` maps to `apps/web/src`.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-011-web-path-alias.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
