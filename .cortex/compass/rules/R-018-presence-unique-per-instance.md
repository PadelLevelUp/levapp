---
id: R-018
title: "`(player_id, lesson_instance_id)` is unique on presences"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/models/**/*.py"
  - "backend/padel_app/services/**/*.py"
confidence: EXTRACTED
status: active
---

# R-018 — `(player_id, lesson_instance_id)` is unique on presences

Never create a second presence for the same player and instance; update the existing row.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
