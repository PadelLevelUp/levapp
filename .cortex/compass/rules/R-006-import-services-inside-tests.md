---
id: R-006
title: "Tests import service functions inside the test body"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/tests/**/*.py"
confidence: EXTRACTED
status: active
---

# R-006 — Tests import service functions inside the test body

Module-top imports of services create circular imports in the test suite.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
