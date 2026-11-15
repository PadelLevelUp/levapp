---
about: "Messages are soft-deleted via `is_deleted`, never hard-deleted"
permanence: changing
verified: "2026-09-03 (told)"
origin:
  - migrated:compass/rules/R-016-soft-delete-messages.md@ef7a5f3
aliases:
  - R-016
  - R-016-soft-delete-messages
applies_when: "When the agent does work this rule governs: messages are soft-deleted via `is_deleted`, never hard-deleted"
scope:
  - action
match: { commands: [], paths: ["backend/padel_app/services/**/*.py", "backend/padel_app/models/**/*.py"] }
source: user@2026-09-03
---

# R-016 — Messages are soft-deleted via `is_deleted`, never hard-deleted

Conversations render a "Message deleted" placeholder in place of the row.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.

<!-- 3.x fields of compass/rules/R-016-soft-delete-messages.md, carried verbatim by cortex migrate -->
```yaml
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
confidence: EXTRACTED
status: active
```
