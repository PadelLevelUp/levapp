---
id: R-019
title: "`player_level_history` is append-only"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/services/**/*.py"
confidence: EXTRACTED
status: active
---

# R-019 — `player_level_history` is append-only

Rows are never updated or deleted; `player.level` is the latest by `assigned_at`.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
