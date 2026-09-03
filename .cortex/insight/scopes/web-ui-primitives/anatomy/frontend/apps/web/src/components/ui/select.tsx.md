---
path: frontend/apps/web/src/components/ui/select.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 144
size_tokens: 1393
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a2b62120a033b36c8d6c4a1693aa9231645fa69251740e15eacec24c1eea4d82"
---

## Purpose

Stock shadcn/ui select dropdown (`Trigger`/`Content`/`Item`/`Label`/`Separator`/`ScrollUpButton`/`ScrollDownButton`) wrapping Radix Select, positioned via the `"popper"` strategy by default.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-select`: full primitive set.
- `lucide-react`: `Check`/`ChevronDown`/`ChevronUp` icons.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
