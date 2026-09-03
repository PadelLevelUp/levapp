---
id: R-001
title: "Recurring lessons never pre-create instance rows"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/services/**/*.py"
  - "backend/padel_app/modules/**/*.py"
confidence: EXTRACTED
status: active
---

# R-001 — Recurring lessons never pre-create instance rows

Instances are created on demand via `get_or_materialize_instance()`. Always go through this function; never create a `LessonInstance` directly for a recurring lesson.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
