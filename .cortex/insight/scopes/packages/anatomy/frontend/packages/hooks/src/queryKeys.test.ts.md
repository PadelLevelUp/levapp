---
path: frontend/packages/hooks/src/queryKeys.test.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 72
size_tokens: 620
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "1f38d1029618cee870d11025f118d550392b1f195c6dfe9d70554f6326559934"
---

## Purpose

Pins the exact shape of every `queryKeys` entry — including that it must stay byte-identical to the web app's historical inline keys — plus asserts `queryKeys.exercise("e1")[0] === queryKeys.exercises[0]`, i.e. that invalidating `["exercises"]` also matches every per-id detail key (a prefix-matching invariant TanStack Query relies on for cache invalidation).

## Connections

Uses:
- `frontend/packages/hooks/src/queryKeys.ts`: `queryKeys` under test.

Used by: none (leaf test file).
