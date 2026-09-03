---
path: frontend/apps/web/src/components/ui/label.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 18
size_tokens: 174
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d5dc9497cbb28a5401b864bd44a15f010c302584fbe8e07e015dbe443f103753"
---

## Purpose

Stock shadcn/ui form label wrapping Radix Label, with a `peer-disabled:opacity-70` state variant defined via `cva` (a single-variant `cva` call, effectively just a named class string).

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-label`: `Root` primitive.
- `class-variance-authority`: `cva`, for the (single) `labelVariants` style.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
