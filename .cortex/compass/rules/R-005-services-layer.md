---
id: R-005
title: "Business logic lives in `padel_app/services/`; route handlers stay thin"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/modules/**/*.py"
confidence: EXTRACTED
status: active
---

# R-005 — Business logic lives in `padel_app/services/`; route handlers stay thin

A handler in `modules/` calls the service and returns the result. Never put business logic in a route handler.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
