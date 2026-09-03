---
path: frontend/apps/web/src/hooks/useVisualViewportHeight.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 41
size_tokens: 266
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "4e0591328e45fe116245e9ae4beaaf10d53239572260b697b7aeb98b46f340fe"
---

## Purpose

`useVisualViewport()` — tracks `window.visualViewport`'s `height`/`offsetTop`, falling back to plain `window.innerHeight` with a `resize` listener when `visualViewport` isn't available. Exists to handle mobile-browser on-screen-keyboard resize behavior (the `visualViewport` API is specifically how a page detects the keyboard covering part of the screen on mobile Safari/Chrome, distinct from `window.resize`), rounding both values to avoid subpixel jitter in consuming layout code. Web-only — React Native has its own native keyboard-avoidance APIs, so this has no mobile-scope counterpart.

## Connections

Uses: none within scope (only `react`).

Used by: no file within this scope (its consumer is a layout component that needs to react to the on-screen keyboard, outside `api/`/`hooks/`/`data/`).
