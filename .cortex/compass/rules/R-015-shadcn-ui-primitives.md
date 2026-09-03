---
id: R-015
title: "Web UI uses the Radix/shadcn primitives in `src/components/ui/`; no competing UI library"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "frontend/apps/web/src/**/*.tsx"
  - "frontend/apps/web/package.json"
confidence: EXTRACTED
status: active
---

# R-015 — Web UI uses the Radix/shadcn primitives in `src/components/ui/`; no competing UI library

One primitive set keeps the design system (`levapp-design-system`) enforceable.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
