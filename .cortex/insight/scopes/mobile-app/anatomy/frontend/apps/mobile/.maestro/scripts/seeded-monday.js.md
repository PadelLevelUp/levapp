---
path: frontend/apps/mobile/.maestro/scripts/seeded-monday.js
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 34
size_tokens: 292
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a66a41f651f454e2aad516e6d046e460d6a36ee71449651920e96a27bbe7dab8"
---

## Purpose

A Maestro inline JS helper (invoked via `runScript` from `.maestro` flow YAML, not imported by any TypeScript file) that computes three seeded dates for mobile E2E flows: the next Monday strictly after today (`seededMonday`, matching the "E2E Academy Class" fixture date), `tomorrow`, and `today`. Its day math deliberately mirrors `apps/web/e2e/scripts/seed.py`'s `days_until_monday = (7 - today.weekday()) % 7 or 7`, translating Python's Monday=0 weekday convention into JS's `getDay()` Sunday=0 convention so both platforms' E2E suites agree on which date the seeded class falls on.

## Connections

Uses: none (no imports; pure `Date` arithmetic).

Used by: no file within this scope — consumed by `.maestro/*.yaml` flow definitions (outside the scope's tracked files) via Maestro's `runScript` output binding (`${output.seededMonday}` etc.).
