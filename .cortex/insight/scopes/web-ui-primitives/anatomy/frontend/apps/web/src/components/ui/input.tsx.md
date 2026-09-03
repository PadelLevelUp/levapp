---
path: frontend/apps/web/src/components/ui/input.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 23
size_tokens: 208
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "aa69aaa7cd1ef5ae2410756c90111186057f986c4fdfd1f8b06a8c3c2747f189"
---

## Purpose

Base single-line text input primitive. LevApp tokens: `h-11` height and a 3px `ring-ring/40` focus ring, matching `button.tsx`'s convention rather than stock shadcn/ui's `h-10`/2px ring.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `button.tsx` — shares the `h-11` height and 3px `ring-ring/40` focus-ring tokens.
