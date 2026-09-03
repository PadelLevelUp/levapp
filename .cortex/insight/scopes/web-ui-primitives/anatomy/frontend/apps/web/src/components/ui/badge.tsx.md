---
path: frontend/apps/web/src/components/ui/badge.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 32
size_tokens: 307
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2688620e856c7b0014984c16d62734e8a2e0c3f8b63bba9be57b68213adafb1c"
---

## Purpose

Status/label chip via `cva` variants (`default`/`secondary`/`destructive`/`outline`). Carries explicit LevApp design-system rules in its own comments: chips use the 6px (`rounded-md`) radius specifically to visually distinguish status chips from full-pill filter controls, and hover states brighten (`hover:brightness-95`) rather than fade via opacity, matching the app-wide "no opacity fades on hover" rule also seen in `button.tsx`. Diverges from stock shadcn/ui, which does not encode a radius-by-role convention.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `class-variance-authority`: `cva` for the four variants.
- `react`: types only (`HTMLAttributes`).

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `button.tsx` and `card.tsx` — share the same "brightness not opacity" hover rule and radius-by-role design convention documented in their own comments; see the `levapp-visual-design-conventions` concept.
