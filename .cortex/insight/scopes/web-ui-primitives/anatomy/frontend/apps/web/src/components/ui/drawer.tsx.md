---
path: frontend/apps/web/src/components/ui/drawer.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 88
size_tokens: 735
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3739cdfc80503412db604efb3ac0149db5f7cd5fec18508839d18dec195720e1"
---

## Purpose

Bottom-sheet drawer wrapping the `vaul` library's `Drawer`. Defaults `shouldScaleBackground` to `true` and renders a drag-handle bar above `children` in `DrawerContent`.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `react`: `forwardRef` pattern.
- `vaul`: `Drawer` (aliased `DrawerPrimitive`), the underlying swipeable-sheet implementation.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
