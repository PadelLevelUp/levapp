---
id: R-016
title: "Messages are soft-deleted via `is_deleted`, never hard-deleted"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/services/**/*.py"
  - "backend/padel_app/models/**/*.py"
confidence: EXTRACTED
status: active
---

# R-016 — Messages are soft-deleted via `is_deleted`, never hard-deleted

Conversations render a "Message deleted" placeholder in place of the row.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
