---
path: frontend/apps/web/src/components/ui/toggle.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 38
size_tokens: 354
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "fb0f786bce638fd414f220e31ad3c902f5c6e25eee9c95ac955cacd50638d6ff"
---

## Purpose

Single pressed/unpressed toggle button (`default`/`outline` variants × `sm`/`default`/`lg` sizes) wrapping Radix Toggle. Exports `toggleVariants` for reuse by `toggle-group.tsx`.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-toggle`: `Root` primitive.
- `class-variance-authority`: `cva`, for `toggleVariants`.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `toggle-group.tsx` (same scope) — imports `toggleVariants` directly.
