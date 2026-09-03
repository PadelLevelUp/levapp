---
path: frontend/packages/config/src/dashboard-format.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 72
size_tokens: 657
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "fc504c0c37e3b213a2d47492df913f92b4ab1a5502fe5cce8fb3ef7a8e4e85fc"
---

## Purpose

Locale-aware date/greeting formatting for the coach dashboard: the server sends ISO dates and English weekday names as a switch value only (never printed directly), and every user-facing string is produced here from the ISO value via `Intl.DateTimeFormat` so pt-PT renders "terça-feira, 4 de agosto" correctly. `parseISODate` and `todayISO` exist specifically to avoid the UTC/local date off-by-one: `new Date("2026-08-04")` parses as UTC and can shift a day backwards west of Greenwich, and `new Date().toISOString().slice(0,10)` reintroduces the same bug on the "today" side — both are deliberately avoided in favor of manual local-time construction/formatting.

## Connections

Uses: none (leaf, no imports).

Used by:
- `frontend/packages/config/src/index.ts`: re-exported as part of the `@levelup/config` barrel.
- `frontend/packages/config/src/dashboard-format.test.ts`: unit tests, including a regression test for the local-midnight-in-a-UTC+1-zone bug.
