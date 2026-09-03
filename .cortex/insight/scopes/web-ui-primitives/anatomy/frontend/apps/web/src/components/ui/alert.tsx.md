---
path: frontend/apps/web/src/components/ui/alert.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 44
size_tokens: 386
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6352c232d36b2aeb20cce9692fecd98a472c8bb0b8c3f8a45446c433382e2da7"
---

## Purpose

Inline alert/banner component with `default`/`destructive` variants via `cva`. Simple stock shadcn/ui alert with icon-aware padding (`[&>svg~*]:pl-7`) — no Radix dependency, plain `<div role="alert">`.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `class-variance-authority`: `cva` for the `default`/`destructive` variant styles.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
