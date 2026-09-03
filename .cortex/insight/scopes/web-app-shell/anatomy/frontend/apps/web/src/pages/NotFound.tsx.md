---
path: frontend/apps/web/src/pages/NotFound.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 27
size_tokens: 215
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f5e3dd40a4a2a3069d6d2d3080765f7633d31dcad61aba71ed700690f75f92d9"
---

## Purpose

The catch-all 404 page for any unmatched route. Logs the attempted path to `console.error` on mount, then renders a centered heading/message/"return home" link (a plain `<a href="/">`, not a router `<Link>`, so it forces a full page reload rather than a client-side navigation).

## Connections

Uses: `react-router-dom` (`useLocation`, external), external `react`, `react-i18next`.

Used by: `frontend/apps/web/src/App.tsx`, mounted at the wildcard `*` route (last entry in the route table, unguarded).
