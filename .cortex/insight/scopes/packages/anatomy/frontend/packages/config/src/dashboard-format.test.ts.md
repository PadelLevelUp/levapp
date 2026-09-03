---
path: frontend/packages/config/src/dashboard-format.test.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 71
size_tokens: 559
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6d67da0dddbd755edff68cb68a68b84bfaf0c11c1d338ee8f62aa5e2a1265a6d"
---

## Purpose

Unit tests for `dashboard-format.ts`: pins `todayISO`'s local-not-UTC behavior (including the 00:30-in-UTC+1 regression case, zero-padding, and round-tripping through `parseISODate`), `parseISODate`'s local-midnight parsing, `greetingKey`'s hour boundaries, and locale-aware rendering for `longDate`/`shortDate`/`weekdayShort`/`weekdayLong` in both `pt` and `en`.

## Connections

Uses:
- `frontend/packages/config/src/dashboard-format.ts`: `greetingKey`, `longDate`, `parseISODate`, `shortDate`, `todayISO`, `weekdayLong`, `weekdayShort` under test.

Used by: none (leaf test file).
