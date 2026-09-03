---
id: R-020
title: "Editing an instance that diverges from its parent lesson records the diverging fields in `overridden_fields`"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/services/**/*.py"
  - "frontend/apps/web/src/**/*.tsx"
confidence: EXTRACTED
status: active
---

# R-020 — Editing an instance that diverges from its parent lesson records the diverging fields in `overridden_fields`

This JSON is how the frontend distinguishes custom from inherited values.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
