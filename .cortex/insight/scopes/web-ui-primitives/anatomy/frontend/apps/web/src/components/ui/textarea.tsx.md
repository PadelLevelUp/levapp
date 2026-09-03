---
path: frontend/apps/web/src/components/ui/textarea.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 22
size_tokens: 187
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2f5b24d28dc5c41817ca69653a396adcb2fe495200f8184777d086a62fc70461"
---

## Purpose

Base multi-line text input primitive, stock shadcn/ui styling (`min-h-[80px]`, standard focus ring). Wrapped by `message-textarea.tsx` for chat composition.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `message-textarea.tsx` (same scope) — wraps this component to add autosize and Enter-key behavior.
