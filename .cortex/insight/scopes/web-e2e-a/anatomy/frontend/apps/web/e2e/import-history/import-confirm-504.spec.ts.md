---
path: frontend/apps/web/e2e/import-history/import-confirm-504.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 105
size_tokens: 968
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ef8f7f24aee879749fd878574a8022223ee7f75ea7ae50e532c69c2c6053d14b"
---

## Purpose

PAD-11 regression test at the HTTP layer for the Excel-import "Confirm"
step: the old single blocking POST could exceed the front gateway's idle
timeout on large uploads and return a false 504 even though rows were
committed incrementally. The fix streams the confirm step over SSE, and
these tests hit `/api/app/import/confirm/stream` directly, asserting a
real `text/event-stream` 200 response that ends with a terminal `done`
event carrying per-table import results, and that the imported players are
immediately queryable afterward (no refresh needed).

## Connections

- Uses:
  - `helpers/auth.ts`: `COACH_USERNAME`, `COACH_PASSWORD` (direct HTTP
    login, not the `loginAsCoach` page helper).
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/import/confirm.spec.md`;
  the streaming confirm endpoint under test is the direct successor of the
  non-streaming one exercised by `import-history/import-history.spec.ts`'s
  `seedImportViaAPI`.
