---
id: R-017
title: "Conversation lookup goes through `Conversation.build_participant_key()`"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/**/*.py"
confidence: EXTRACTED
status: active
---

# R-017 — Conversation lookup goes through `Conversation.build_participant_key()`

Sorted, comma-separated user ids make the lookup idempotent; hand-built keys break it.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
