---
about: "Anything added to `apps/web` is added to `apps/mobile` in the same ticket"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-024-web-and-ios-ship-together.md@ef7a5f3
aliases:
  - R-024
  - R-024-web-and-ios-ship-together
applies_when: "When the agent does work this rule governs: anything added to `apps/web` is added to `apps/mobile` in the same ticket"
scope:
  - action
match: { commands: [], paths: ["frontend/apps/web/src/**/*.tsx", "frontend/apps/mobile/app/**/*.tsx", "frontend/apps/mobile/src/**/*.tsx"] }
source: user@2026-09-03
---

# R-024 — Anything added to `apps/web` is added to `apps/mobile` in the same ticket

Web-only is the exception and must be argued for in the PR body and the spec; a follow-up ticket is not a reason. Mobile i18n is static-import — a new namespace works on web and renders raw key paths on mobile until hand-added in `apps/mobile/src/lib/i18n.ts`.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-024-web-and-ios-ship-together.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-07-web-and-ios-ship-together.md
confidence: EXTRACTED
status: active
```
