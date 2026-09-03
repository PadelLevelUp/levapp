---
path: frontend/apps/web/src/components/ui/scroll-area.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 39
size_tokens: 402
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "998181a10164aa6e508210064ba61b2f772a92958d7bb2141867007f0ebd9783"
---

## Purpose

Stock shadcn/ui custom scrollbar wrapping Radix ScrollArea (`Root`/`Viewport`/`Scrollbar`/`Thumb`/`Corner`), with a separately-exported `ScrollBar` sub-component for standalone use.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-scroll-area`: full primitive set.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
