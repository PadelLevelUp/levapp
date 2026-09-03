---
id: R-002
title: "Levels, evaluation categories, exercises, notification config and player notes are coach-scoped"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/services/**/*.py"
  - "backend/padel_app/models/**/*.py"
confidence: EXTRACTED
status: active
---

# R-002 — Levels, evaluation categories, exercises, notification config and player notes are coach-scoped

A coach only sees their own data. The same player can carry different levels and evaluations from different coaches.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
