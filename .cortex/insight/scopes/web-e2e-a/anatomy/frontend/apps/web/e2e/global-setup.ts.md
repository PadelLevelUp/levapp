---
path: frontend/apps/web/e2e/global-setup.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 17
size_tokens: 132
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "48d66b8891343666eb09ad149936a958b15b5a57cfd319b9bd3f2cf7be135e7b"
---

## Purpose

Playwright's `globalSetup` export, run once before the whole suite: shells
out to `e2e/scripts/reset-test-db.sh` to reset and reseed the
`levelup_test` database before any spec — including the webServer's own
boot — runs.

## Connections

- Uses: — (no resolved in-repo imports; shells out to
  `scripts/reset-test-db.sh` via `child_process.execSync`)
- Used by: wired into `playwright.config.ts`'s `globalSetup` option
  (outside this scope)
- Semantically related (not imports): project memory flags that the Flask
  webServer can boot BEFORE this reset finishes, so a stale `levelup_test`
  schema can crash startup with an APScheduler error — `reset-test-db.sh`
  should be run manually first when debugging that failure mode.
