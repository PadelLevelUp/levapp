---
id: R-011
title: "Web imports use the `@/` alias, never relative `../../` paths"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "frontend/apps/web/src/**/*.ts"
  - "frontend/apps/web/src/**/*.tsx"
confidence: EXTRACTED
status: active
---

# R-011 — Web imports use the `@/` alias, never relative `../../` paths

`@/` maps to `apps/web/src`.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
