---
path: frontend/apps/web/src/components/ui/card.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 52
size_tokens: 521
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8d397411182c9c6557e8934ca699383e5d7bfaa29ea45227144ed4c39ef69911"
---

## Purpose

Card container plus `Header`/`Title`/`Description`/`Content`/`Footer` slots. LevApp design-system rules are explicit in the comments: cards carry a 1px border and deliberately **no shadow** — the app reserves its single shadow family for elements that genuinely float (sheets, popovers, the device frame) — and use a 16px (`rounded-2xl`) radius, larger than stock shadcn/ui's `rounded-lg`, under a stated "radii rise with size" rule.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `react`: `forwardRef` pattern.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.

Semantically related (not imports):
- `button.tsx`, `badge.tsx` — share the same design-convention comment style (radius-by-role, no-shadow-except-floating); see `levapp-visual-design-conventions`.
