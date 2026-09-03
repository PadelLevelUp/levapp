---
path: frontend/apps/web/src/vite-env.d.ts
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 2
size_tokens: 10
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "65996936fbb042915f7b74a200fcdde7e410f32a669b1ab9597cfaa4b0faddb5"
---

## Purpose

Standard Vite-generated ambient type declaration (`/// <reference types="vite/client" />`) that brings `import.meta.env`, `import.meta.glob`, and other Vite client types into TypeScript's global scope. No app-specific content.

## Connections

Uses: `vite/client` (external, type-only reference).

Used by: nothing imports this directly — it is a global ambient declaration file picked up by the TypeScript compiler across the whole web app (e.g. enables `i18n.ts`'s `import.meta.glob` and `config.ts`'s `import.meta.env` to type-check).
