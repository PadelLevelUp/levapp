---
path: frontend/apps/web/src/components/ui/hover-card.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 28
size_tokens: 298
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8d606e166ef5f9bc4fc3efb1f6ce2f4bb376177a2c6fef16f67f87ad2d13d005"
---

## Purpose

Stock shadcn/ui hover-triggered popover card wrapping Radix HoverCard, fixed `w-64` width.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-hover-card`: `Root`/`Trigger`/`Content` primitives.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
