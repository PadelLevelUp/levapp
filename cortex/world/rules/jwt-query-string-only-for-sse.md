---
about: "JWT is accepted in the Authorization header everywhere, and in the `?token=` query string only on the SSE endpoint"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-009-jwt-query-string-only-for-sse.md@ef7a5f3
aliases:
  - R-009
  - R-009-jwt-query-string-only-for-sse
applies_when: "When the agent does work this rule governs: jWT is accepted in the Authorization header everywhere, and in the `?token=` query string only on the SSE endpoint"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/modules/**/*.py"] }
source: user@2026-09-03
---

# R-009 — JWT is accepted in the Authorization header everywhere, and in the `?token=` query string only on the SSE endpoint

`EventSource` cannot set headers, so `/api/app/events` is the single query-string exception. No other endpoint reads a token from the URL.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-009-jwt-query-string-only-for-sse.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
