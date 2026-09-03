---
id: R-023
title: "Backend datetimes are naive UTC; club-local logic converts explicitly"
source:
  - ../../atlas/decisions/2026-09-03-legacy-rules-migrated-to-compass.md
governs:
  - "backend/padel_app/**/*.py"
confidence: EXTRACTED
status: active
---

# R-023 — Backend datetimes are naive UTC; club-local logic converts explicitly

Store and compare in UTC (`utcnow_naive`). Anything that means a club-local day or hour converts via `CLUB_TZ` helpers in `padel_app/utils/dates.py` — the naive-UTC-vs-local family produced PAD-134, PAD-136 and PAD-144.

**Why:** extracted from consistent patterns in the codebase (legacy `RULES.md`, April 2026); breaking it has produced real bugs or silent divergence.
