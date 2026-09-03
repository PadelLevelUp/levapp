---
id: R-004
title: "Many-to-many relationships use explicit association tables with an `id` primary key"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/models/**/*.py"
  - "backend/migrations/versions/*.py"
confidence: EXTRACTED
status: active
---

# R-004 — Many-to-many relationships use explicit association tables with an `id` primary key

Not bare composite keys — the tables routinely carry extra fields (`coach_in_player.side`, `coach_exercise.role`).

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
