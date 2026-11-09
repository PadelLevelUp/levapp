---
about: "Integration tests patch external I/O and inject `now=`"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-008-patch-io-inject-now.md@ef7a5f3
aliases:
  - R-008
  - R-008-patch-io-inject-now
applies_when: "When the agent does work this rule governs: integration tests patch external I/O and inject `now=`"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/tests/**/*.py"] }
source: user@2026-09-03
---

# R-008 — Integration tests patch external I/O and inject `now=`

Mock Redis publish, push notifications and the scheduler; never mock `datetime` — time-dependent logic takes a `now=` parameter.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-008-patch-io-inject-now.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
