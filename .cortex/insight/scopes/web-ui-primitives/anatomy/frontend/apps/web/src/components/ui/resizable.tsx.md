---
path: frontend/apps/web/src/components/ui/resizable.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 38
size_tokens: 424
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a31af34c14c7c86612d1c2e51c90da59e0edae37dab5210bc1dd2c91dc2f3edd"
---

## Purpose

Stock shadcn/ui resizable panel group/handle wrapping `react-resizable-panels`, with an optional visible grip icon on the handle (`withHandle` prop).

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `lucide-react`: `GripVertical` icon.
- `react-resizable-panels`: `PanelGroup`/`Panel`/`PanelResizeHandle` (aliased `ResizablePrimitive`).

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
