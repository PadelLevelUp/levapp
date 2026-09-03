---
path: frontend/packages/config/src/calendar-status.test.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 397
size_tokens: 3993
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "592365e62f197bf45ba6b854015e1ad7ea3723ce1e4559aad7b2b5a0afcea853"
---

## Purpose

Exercises `calendar-status.ts` against the 8 actual swatch hexes a coach can pick (from `AddClassSheet`/`ClassDetailSheet`), independently reimplementing luminance/contrast math (`luminance`, `contrast` helpers) so the test doesn't just call back into the module it's checking. Covers contrast-text selection, fade/readable-ink blending on both the web (CSS string) and native (resolved color) emitters, `resolveEventState` transitions, and `findNextEventId` — including asserting the CSS `color-mix()` output and the native `mixColors()` arithmetic agree rather than assuming it by construction.

## Connections

Uses:
- `frontend/packages/config/src/calendar-status.ts`: the module under test — `contrastTextOn`, `contrastTextOnNative`, `fadeColor`, `fadeColorNative`, `findNextEventId`, `hasOpenSpots`, `mixColors`, `nativeCalendarSurfaces`, `parseColor`, `readableInk`, `readableInkNative`, `relativeLuminance`, `resolveEventState`, `withAlpha`, and its exported constants.
- `frontend/packages/config/src/tokens.ts`: `darkTheme`, `lightTheme` for surface colors in native-path assertions.

Used by: none (leaf test file).
