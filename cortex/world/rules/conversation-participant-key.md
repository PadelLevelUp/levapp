---
about: "Conversation lookup goes through `Conversation.build_participant_key()`"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-017-conversation-participant-key.md@ef7a5f3
aliases:
  - R-017
  - R-017-conversation-participant-key
applies_when: "When the agent does work this rule governs: conversation lookup goes through `Conversation.build_participant_key()`"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/**/*.py"] }
source: user@2026-09-03
---

# R-017 — Conversation lookup goes through `Conversation.build_participant_key()`

Sorted, comma-separated user ids make the lookup idempotent; hand-built keys break it.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-017-conversation-participant-key.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
