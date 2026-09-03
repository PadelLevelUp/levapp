---
path: frontend/apps/web/vite.config.ts
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 29
size_tokens: 158
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0864d95be760179f8058ba6c700a49b6eb07f6ee7d678f536b55ec6e27827713"
---

## Purpose

Vite dev/build configuration: dev server on `host: "::"` (all interfaces), port 8080, `allowedHosts: true`; proxies `/api` to the Flask backend at `http://127.0.0.1:<VITE_BACKEND_PORT ?? 5000>` (this is how `E2E_BACKEND_PORT`/`VITE_BACKEND_PORT` from `playwright.config.ts` reach the dev server during E2E runs); registers `@vitejs/plugin-react` and, only in `development` mode, `lovable-tagger`'s `componentTagger`; aliases `@` to `./src`.

## Connections

Uses: `vite` (external, `defineConfig`), `@vitejs/plugin-react` (external), `path` (Node built-in), `lovable-tagger` (external, dev-mode only).

Used by: the Vite CLI (`npm run dev`, `vite build`) for the web app; the `/api` proxy target port is set from `VITE_BACKEND_PORT`, which `playwright.config.ts` (this scope) passes through when it starts `npm run dev` as an E2E web server.
