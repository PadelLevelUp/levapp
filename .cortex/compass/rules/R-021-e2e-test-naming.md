---
id: R-021
title: "E2E tests are named `\"US-XXX: description\"`"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "frontend/apps/web/e2e/**/*.ts"
confidence: EXTRACTED
status: active
---

# R-021 — E2E tests are named `"US-XXX: description"`

Traceability from a failing spec back to the user story / ticket.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
