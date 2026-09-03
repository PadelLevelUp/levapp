---
id: R-003
title: "All lessons belong to a club"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/services/**/*.py"
  - "backend/padel_app/models/**/*.py"
confidence: EXTRACTED
status: active
---

# R-003 — All lessons belong to a club

`lessons.club_id` (CASCADE). Player and calendar queries are filtered by the coach's current club.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
