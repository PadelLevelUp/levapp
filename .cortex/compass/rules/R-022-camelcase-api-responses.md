---
id: R-022
title: "The backend serialises API responses in camelCase"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/modules/**/*.py"
  - "backend/padel_app/serializers/**/*.py"
  - "frontend/packages/types/**/*.ts"
confidence: EXTRACTED
status: active
---

# R-022 — The backend serialises API responses in camelCase

`startTime`, `maxPlayers`, `coachId`; the `@levelup/types` package mirrors it exactly.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
