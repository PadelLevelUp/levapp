---
path: frontend/apps/web/src/components/ui/toggle-group.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 50
size_tokens: 428
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a3ea231230c8fff22ff6e0b457e71addf961fe1f80deaba0c80d17e649d34bf3"
---

## Purpose

Grouped toggle buttons sharing `variant`/`size` via a React context, wrapping Radix ToggleGroup and reusing `toggleVariants` from `toggle.tsx` so individual items and the group render identical styling.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@/components/ui/toggle`: `toggleVariants`, the shared style function.
- `@radix-ui/react-toggle-group`: `Root`/`Item` primitives.
- `react`: context, `forwardRef`.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `toggle.tsx` (same scope) — supplies `toggleVariants`; the two files must be kept visually in sync.
