---
path: frontend/apps/web/src/components/ui/radio-group.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 37
size_tokens: 361
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "995ec983735b204597f11ae5dd22ba0175dfc633da2ddecf222847bbca387adb"
---

## Purpose

Stock shadcn/ui radio group/item wrapping Radix RadioGroup, with a filled-`Circle` icon as the checked indicator.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-radio-group`: `Root`/`Item`/`Indicator` primitives.
- `lucide-react`: `Circle` icon.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
