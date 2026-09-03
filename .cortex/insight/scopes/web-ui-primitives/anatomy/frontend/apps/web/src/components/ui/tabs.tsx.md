---
path: frontend/apps/web/src/components/ui/tabs.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 54
size_tokens: 474
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b313d08a8c85e586a282b615cf30ce0b6ec1eca3ea92149b731f14b4082f4d71"
---

## Purpose

Stock shadcn/ui tabs (`List`/`Trigger`/`Content`) wrapping Radix Tabs.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-tabs`: `Root` (re-exported as `Tabs`), `List`/`Trigger`/`Content` primitives.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
