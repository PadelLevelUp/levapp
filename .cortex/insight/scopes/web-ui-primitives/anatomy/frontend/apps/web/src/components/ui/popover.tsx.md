---
path: frontend/apps/web/src/components/ui/popover.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 30
size_tokens: 309
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ee5f78ece57c9e8eb5f9b4186e2bb9ebe46b69b52f03f1edd9a601883bc64772"
---

## Purpose

Stock shadcn/ui floating popover wrapping Radix Popover, fixed `w-72` width.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-popover`: `Root`/`Trigger`/`Content`/`Portal` primitives.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
