---
path: frontend/apps/web/eslint.config.js
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 27
size_tokens: 191
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c55264234fef783629810643d995cd522c3adaeb60e7157906310607292015a3"
---

## Purpose

Flat ESLint config for the web app: applies the recommended JS + typescript-eslint rule sets to every `.ts`/`.tsx` file, wires the `react-hooks` and `react-refresh` plugins, and turns off `@typescript-eslint/no-unused-vars` (left to TypeScript's own compiler diagnostics rather than lint). Ignores `dist`. Runs under browser globals (`ecmaVersion: 2020`).

## Connections

Uses: `@eslint/js`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `typescript-eslint` (all external).

Used by: the web app's lint script/CI step (outside this scope); applies to every source file in `frontend/apps/web`.
