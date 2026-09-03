---
id: R-014
title: "Real-time updates arrive over SSE (`/api/app/events`); never poll"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "frontend/apps/web/src/**/*.ts"
  - "frontend/apps/web/src/**/*.tsx"
  - "frontend/packages/api/**/*.ts"
confidence: EXTRACTED
status: active
---

# R-014 — Real-time updates arrive over SSE (`/api/app/events`); never poll

Messages and notifications are pushed; a polling loop duplicates the SSE path and multiplies backend threads.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
