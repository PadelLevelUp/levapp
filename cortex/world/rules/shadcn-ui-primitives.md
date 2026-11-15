---
about: "Web UI uses the Radix/shadcn primitives in `src/components/ui/`; no competing UI library"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-015-shadcn-ui-primitives.md@ef7a5f3
aliases:
  - R-015
  - R-015-shadcn-ui-primitives
applies_when: "When the agent does work this rule governs: web UI uses the Radix/shadcn primitives in `src/components/ui/`; no competing UI library"
scope:
  - action
match: { commands: [], paths: ["frontend/apps/web/src/**/*.tsx", frontend/apps/web/package.json] }
source: user@2026-09-03
---

# R-015 — Web UI uses the Radix/shadcn primitives in `src/components/ui/`; no competing UI library

One primitive set keeps the design system (`levapp-design-system`) enforceable.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-015-shadcn-ui-primitives.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
