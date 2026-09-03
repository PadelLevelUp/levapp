---
path: frontend/apps/web/src/test/setup.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 16
size_tokens: 88
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7fb65ef092291d0278639dc0567ebfd960f097fef0c869d43d0b9b4485449bfc"
---

## Purpose

The vitest global setup file (referenced from the web app's vitest config, outside this scope): imports `@testing-library/jest-dom`'s custom matchers and stubs `window.matchMedia` with a no-op mock implementation (`matches: false`, no-op listener methods) so any code under test that calls `matchMedia` — notably `hooks/use-mobile.tsx`'s `useIsMobile` — doesn't crash in jsdom, which has no real `matchMedia` implementation.

## Connections

Uses: `@testing-library/jest-dom`.

Used by: no file within this scope — wired in via the vitest config's `setupFiles`, run before every test file in the suite (including any test file that exercises `hooks/use-mobile.tsx`).
