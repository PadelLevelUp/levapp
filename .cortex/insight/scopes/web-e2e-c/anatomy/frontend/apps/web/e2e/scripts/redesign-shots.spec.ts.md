---
path: frontend/apps/web/e2e/scripts/redesign-shots.spec.ts
extracted_at: 2026-09-03T14:18:15Z
extraction_level: 2
size_lines: 103
size_tokens: 1070
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "15edd60479bf44b9b74d044bb1658c0fb7a4ee77322576bace93b7e9bf8fd1b4"
---

## Purpose

Not a test — a manual screenshot harness for reviewing the visual redesign,
written as a substitute for a broken Chrome-extension walkthrough tool. Skips
unless `REDESIGN_SHOTS=1` is set, so it has no effect on a normal test run and
needs no separate Playwright `testMatch` config. When invoked it logs in as
the seeded coach and walks auth, dashboard, calendar, players, messages and
settings across light/dark themes and desktop/mobile viewports, writing named
PNGs into the gitignored `test-results/redesign-shots` directory.

## Connections

Uses: (none — logs in inline with raw locators rather than the `auth` helper, and writes screenshots directly)

Used by: —

Semantically related (not imports): visits nearly every top-level page of the
web app (dashboard, calendar, players, messages, settings) purely for visual
capture, not assertions; not tied to any spec leaf.
