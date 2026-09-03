---
path: frontend/packages/types/src/index.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 3
size_tokens: 14
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ca33c1ebd33167377b841b0fe236c4571d429e56a15c8251222f56a5616236c8"
---

## Purpose

The `@levelup/types` public entrypoint: `export * from "./domain"` plus `export * from "./training"` — the two files hold the entire shared type vocabulary between them, with no overlap in names to resolve.

## Connections

Uses:
- `frontend/packages/types/src/domain.ts`, `frontend/packages/types/src/training.ts`: everything it re-exports.

Used by: no file within this scope imports the barrel by path (everything imports `@levelup/types` directly, which resolves through this file at the package boundary); its consumers are every resource/hook/config module across the scope plus `apps/web`/`apps/mobile`.
