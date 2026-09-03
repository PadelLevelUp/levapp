---
id: R-008
title: "Integration tests patch external I/O and inject `now=`"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/tests/**/*.py"
confidence: EXTRACTED
status: active
---

# R-008 — Integration tests patch external I/O and inject `now=`

Mock Redis publish, push notifications and the scheduler; never mock `datetime` — time-dependent logic takes a `now=` parameter.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
