---
id: R-013
title: "Playwright locators follow role > placeholder > label > text > CSS"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "frontend/apps/web/e2e/**/*.ts"
confidence: EXTRACTED
status: active
---

# R-013 — Playwright locators follow role > placeholder > label > text > CSS

`getByRole` first; a CSS class selector is the last resort.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
