---
path: frontend/apps/web/playwright.config.ts
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 84
size_tokens: 666
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "dec8071c4e7c745dde1201b42c8018ca015c6ee39b9e1cf4a59c12f8bb0f9bbc"
---

## Purpose

Playwright E2E configuration: single worker, serial execution (`fullyParallel: false`) to avoid DB conflicts, a 3-minute test timeout for scheduler tests, and a two-process `webServer` array that boots the Flask backend (from `../../../backend`, reading `POSTGRES_PW`/`POSTGRES_PORT` env, `levelup_test` DB, `E2E_DEBUG_ENDPOINTS`/`TEST_MODE` on) and `npm run dev` for the Vite app on port 8080. The backend port defaults to 5001 but is overridable via `E2E_BACKEND_PORT` because that port is a popular squat target for unrelated local projects, and `reuseExistingServer: false` means Playwright can't just adopt whatever else is listening there. A code comment documents a verified Playwright 1.62.1 gotcha: `reducedMotion: "reduce"` in `use` is inert and must be set via `page.emulateMedia()` instead — the login helper (`e2e/helpers/auth.ts`, outside this scope) does that.

## Connections

Uses: `@playwright/test`, `path`, `url` (all external).

Used by: the `npx playwright test` invocation for the web app's E2E suite (outside this scope, under `e2e/`).
