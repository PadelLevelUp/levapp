---
path: frontend/apps/web/src/components/ui/use-toast.ts
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 4
size_tokens: 20
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d48c4c490e5101aa42ceed9b8ca49642d66152ba11daf7ee6c29bee0f5172c37"
---

## Purpose

One-line re-export barrel forwarding `useToast`/`toast` from the `@/hooks/use-toast` implementation, so consumers can import the hook from `@/components/ui/use-toast` alongside the other `ui/` primitives rather than reaching into `@/hooks`.

## Connections

Uses:
- `@/hooks/use-toast` (outside this scope): `useToast`, `toast` — the actual implementation this re-exports.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
