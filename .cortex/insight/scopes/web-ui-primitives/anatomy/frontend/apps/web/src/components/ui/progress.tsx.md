---
path: frontend/apps/web/src/components/ui/progress.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 24
size_tokens: 191
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "bdc4847f05de3aea1276966e0df9b4a293297f0ca7d7b430a1cb16cf5626728f"
---

## Purpose

Stock shadcn/ui progress bar wrapping Radix Progress; translates the `value` prop into a `translateX` offset on the indicator rather than a width change.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-progress`: `Root`/`Indicator` primitives.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
