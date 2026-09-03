---
path: frontend/apps/web/src/hooks/use-mobile.tsx
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 20
size_tokens: 144
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "21eff740f9e5c965c7f0782925a7e8f67ddfcdf0f58b6613550f99c3e1c454e9"
---

## Purpose

`useIsMobile()` — a `matchMedia`-backed viewport hook returning whether the window is narrower than a 768px breakpoint, defaulting to `undefined` until the effect runs (coerced to `false` on return via `!!isMobile`) so server-rendered/first-paint markup doesn't flash the wrong layout. Web-only: this is a `matchMedia`/`window` API, with no mobile-app equivalent needed since React Native has no viewport-breakpoint concept.

## Connections

Uses: none within scope (only `react`).

Used by: no file within this scope (its consumers are responsive-layout components, outside `api/`/`hooks/`/`data/`).
