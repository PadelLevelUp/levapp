---
path: frontend/apps/web/src/components/ui/table.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 73
size_tokens: 673
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "fab18d9eeb84781f534330ff4b2c2cbe3a93f9bdf5c449debff2f682a83a4876"
---

## Purpose

Stock shadcn/ui table primitives (`Table`/`Header`/`Body`/`Footer`/`Row`/`Head`/`Cell`/`Caption`); `Table` itself wraps the `<table>` in an `overflow-auto` container for horizontal scroll on narrow viewports.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
