---
id: decision.2026-09-03-legacy-rules-migrated-to-compass
title: Legacy RULES.md conventions migrated into the compass
date: 2026-09-03T12:00:00Z
compass_rules:
  - R-001
  - R-002
  - R-003
  - R-004
  - R-005
  - R-006
  - R-007
  - R-008
  - R-009
  - R-010
  - R-011
  - R-012
  - R-013
  - R-014
  - R-015
  - R-016
  - R-017
  - R-018
  - R-019
  - R-020
  - R-021
  - R-022
  - R-023
---

# Legacy RULES.md conventions migrated into the compass

On 2026-09-03, during the monorepo + Cortex migration, the 24 numbered rules in the
April-2026 `RULES.md` ("hard constraints extracted from the codebase") were moved one-per-file
into `compass/rules/` with `governs:` globs so the PreWrite hook can surface them. The commit-
message convention (`feat(PAD-123): …`) is a project preference, not a file-governing rule, and
lives in `compass/preferences.md`. Rule confidence is `EXTRACTED` — they were observed, not
decided — and each can be promoted to `STATED` once a decision record justifies it.
