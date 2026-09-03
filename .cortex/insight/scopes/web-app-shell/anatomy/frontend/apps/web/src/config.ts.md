---
path: frontend/apps/web/src/config.ts
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 9
size_tokens: 123
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0d58399f5e86d3ff1a95e691428df709db2ca918d3ad97a7c664a8ddfb42f010"
---

## Purpose

Defines `USE_MOCK_DATA` — true when `VITE_USE_MOCK_DATA` is `"true"` OR unset (mock data is the default when the env var isn't configured) — and re-exports the shared design tokens (`lightTheme`, `darkTheme`, `lightThemeHsl`, `darkThemeHsl`, `radius`) from `@levelup/config` for programmatic color needs (charts, canvases). A comment notes web's actual styling still comes from `index.css` CSS custom properties; these re-exports are for code that needs the raw values, not CSS.

## Connections

Uses: `@levelup/config` (external/workspace package, outside this scope).

Used by: `frontend/apps/web/src/auth/AuthContext.tsx` (`USE_MOCK_DATA` gates token/user handling and push subscription).
