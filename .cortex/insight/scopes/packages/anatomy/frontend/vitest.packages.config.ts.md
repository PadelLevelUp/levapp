---
path: frontend/vitest.packages.config.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 13
size_tokens: 106
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ebc9d4519c3bde94fffdae476430b2bbc41812bbc66cfb1c1cd458a9e3c82bb1"
---

## Purpose

Vitest config scoping the `packages` test project: runs `packages/*/src/**/*.test.ts` under a plain Node environment (no DOM, no React Native), which is itself an enforcement mechanism — a test that only passes because it accidentally has DOM globals available would fail here, proving the shared code is genuinely platform-neutral. `apps/web` keeps its own separate vitest config (outside this scope).

## Connections

Uses: `vitest/config` (external).

Used by: the `npm run test:packages` script (outside this scope, in `frontend/package.json`) picks up every `*.test.ts` file across `packages/api`, `packages/config`, `packages/hooks`, `packages/types`, `packages/validation` via this config.
