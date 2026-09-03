---
id: R-024
title: "Anything added to `apps/web` is added to `apps/mobile` in the same ticket"
source:
  - ../../atlas/decisions/2026-07-web-and-ios-ship-together.md
governs:
  - "frontend/apps/web/src/**/*.tsx"
  - "frontend/apps/mobile/app/**/*.tsx"
  - "frontend/apps/mobile/src/**/*.tsx"
confidence: EXTRACTED
status: active
---

# R-024 — Anything added to `apps/web` is added to `apps/mobile` in the same ticket

Web-only is the exception and must be argued for in the PR body and the spec; a follow-up ticket is not a reason. Mobile i18n is static-import — a new namespace works on web and renders raw key paths on mobile until hand-added in `apps/mobile/src/lib/i18n.ts`.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
