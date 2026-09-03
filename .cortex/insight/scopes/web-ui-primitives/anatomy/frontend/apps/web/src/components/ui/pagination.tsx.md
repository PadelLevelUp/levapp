---
path: frontend/apps/web/src/components/ui/pagination.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 92
size_tokens: 747
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d9ba35ebb492e134f4e4b408c6ee83c0c26ca6f2f35237f6af23c7b76ce1e0d9"
---

## Purpose

Pagination controls (`Content`/`Item`/`Link`/`Previous`/`Next`/`Ellipsis`) built from plain `<a>` tags styled via `buttonVariants` — Radix has no pagination primitive, so this is composed directly on top of `button.tsx`'s variant system. `Previous`/`Next` carry `react-i18next`-translated labels.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@/components/ui/button`: `ButtonProps` (size type), `buttonVariants` — styles every link as an outline (active) or ghost (inactive) button.
- `lucide-react`: `ChevronLeft`/`ChevronRight`/`MoreHorizontal` icons.
- `react`: component typing only.
- `react-i18next`: `useTranslation`, for previous/next/ellipsis labels.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
