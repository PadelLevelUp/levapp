---
id: R-007
title: "DB operations in tests and scheduler jobs run inside `with app.app_context():`"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/tests/**/*.py"
  - "backend/padel_app/scheduler.py"
confidence: EXTRACTED
status: active
---

# R-007 — DB operations in tests and scheduler jobs run inside `with app.app_context():`

Outside an app context SQLAlchemy has no session bound to the request-less code path.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
