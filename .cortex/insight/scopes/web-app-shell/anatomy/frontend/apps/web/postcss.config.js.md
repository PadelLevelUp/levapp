---
path: frontend/apps/web/postcss.config.js
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 7
size_tokens: 20
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e32657baf631d7c5f4dc67b4b2ee0ec8e7d5b3c41860e09cddce7c0377cd80bc"
---

## Purpose

Trivial PostCSS pipeline: enables the `tailwindcss` and `autoprefixer` plugins so Tailwind's utility classes compile and vendor prefixes are added automatically. No custom configuration.

## Connections

Uses: `tailwindcss`, `autoprefixer` (both external, autoprefixer referenced only as a plugin key).

Used by: Vite's CSS pipeline (outside this scope) for `frontend/apps/web/src/index.css`.
