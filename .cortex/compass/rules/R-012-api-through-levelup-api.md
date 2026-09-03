---
id: R-012
title: "All HTTP calls go through `@levelup/api`; never call axios from a component or screen"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "frontend/apps/web/src/**/*.tsx"
  - "frontend/apps/mobile/src/**/*.tsx"
  - "frontend/apps/mobile/app/**/*.tsx"
confidence: EXTRACTED
status: active
---

# R-012 — All HTTP calls go through `@levelup/api`; never call axios from a component or screen

The shared client injects base URL and token storage per shell; a direct axios call bypasses auth refresh and breaks the web/mobile parity rule.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
