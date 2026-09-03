---
path: frontend/apps/web/src/components/ui/avatar.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 39
size_tokens: 341
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "4a8bc00e5514912c54d414e207266fa100906aec2754d590adcc8ccc46d4c5c9"
---

## Purpose

Circular avatar (image + fallback) wrapping Radix Avatar. Stock shadcn/ui: fixed `h-10 w-10` size, `rounded-full` clipping, muted-background fallback.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-avatar`: `Root`/`Image`/`Fallback` primitives.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
