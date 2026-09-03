---
path: frontend/apps/web/vitest.config.ts
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 17
size_tokens: 99
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2c64550d05cdec49d120f28afd53056372945035b13d54cbd16f8027329f2a84"
---

## Purpose

Vitest configuration for the web app's unit tests: `jsdom` environment (DOM available, unlike the separate `packages` vitest project which runs plain Node), `globals: true` (no need to import `describe`/`it`/`expect`), a `./src/test/setup.ts` setup file, includes `src/**/*.{test,spec}.{ts,tsx}`, and the same `@` → `./src` alias as `vite.config.ts`. Uses the SWC-based React plugin (`@vitejs/plugin-react-swc`) rather than the Babel one for faster test runs.

## Connections

Uses: `vitest/config` (external, `defineConfig`), `@vitejs/plugin-react-swc` (external), `path` (Node built-in).

Used by: `npm test` / `vitest` for the web app; covers `conversationTime.test.ts` (this scope) and every other `*.test.ts`/`*.test.tsx` under `src/`.
