---
about: "Real-time updates arrive over SSE (`/api/app/events`); never poll"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-014-sse-not-polling.md@ef7a5f3
aliases:
  - R-014
  - R-014-sse-not-polling
applies_when: "When the agent does work this rule governs: real-time updates arrive over SSE (`/api/app/events`); never poll"
scope:
  - action
match: { commands: [], paths: ["frontend/apps/web/src/**/*.ts", "frontend/apps/web/src/**/*.tsx", "frontend/packages/api/**/*.ts"] }
source: user@2026-09-03
---

# R-014 — Real-time updates arrive over SSE (`/api/app/events`); never poll

Messages and notifications are pushed; a polling loop duplicates the SSE path and multiplies backend threads.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-014-sse-not-polling.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
