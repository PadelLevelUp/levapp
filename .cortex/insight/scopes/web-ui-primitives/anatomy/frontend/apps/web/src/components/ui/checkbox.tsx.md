---
path: frontend/apps/web/src/components/ui/checkbox.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 27
size_tokens: 263
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "178f8177bedb1704b4dd3e748f4826848981c8af43178c04e1a276a7f017cf1f"
---

## Purpose

Stock shadcn/ui checkbox wrapping Radix Checkbox, with a `Check` icon rendered inside the indicator when checked.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-checkbox`: `Root`/`Indicator` primitives.
- `lucide-react`: `Check` icon.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
