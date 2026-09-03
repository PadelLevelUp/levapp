---
id: R-009
title: "JWT is accepted in the Authorization header everywhere, and in the `?token=` query string only on the SSE endpoint"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/modules/**/*.py"
confidence: EXTRACTED
status: active
---

# R-009 — JWT is accepted in the Authorization header everywhere, and in the `?token=` query string only on the SSE endpoint

`EventSource` cannot set headers, so `/api/app/events` is the single query-string exception. No other endpoint reads a token from the URL.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
