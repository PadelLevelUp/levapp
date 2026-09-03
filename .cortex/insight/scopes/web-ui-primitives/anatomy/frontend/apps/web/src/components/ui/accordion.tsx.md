---
path: frontend/apps/web/src/components/ui/accordion.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 53
size_tokens: 494
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "9587b5ca80cf0aa68bc2a4e6baacebbe07eab14e1c66c6b6420033aeca9219d1"
---

## Purpose

Accessible collapsible-sections primitive wrapping Radix's Accordion. Re-exports `Root` directly as `Accordion` and wraps `Item`/`Trigger`/`Content` with the app's border, spacing, and chevron-rotate styling. A stock shadcn/ui accordion — no LevApp-specific variants or tokens beyond the shared Tailwind theme.

## Connections

Uses:
- `@/lib/utils`: `cn()` for conditional Tailwind class merging.
- `@radix-ui/react-accordion`: `Root`/`Item`/`Header`/`Trigger`/`Content` — the underlying accessible accordion behavior.
- `lucide-react`: `ChevronDown` icon, rotated via `data-state=open` selector.
- `react`: `forwardRef` component pattern used throughout.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
