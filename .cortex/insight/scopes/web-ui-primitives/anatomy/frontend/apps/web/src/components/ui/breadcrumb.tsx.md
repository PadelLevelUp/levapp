---
path: frontend/apps/web/src/components/ui/breadcrumb.tsx
extracted_at: 2026-09-03T14:21:27Z
extraction_level: 2
size_lines: 95
size_tokens: 706
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "37104ce1fb1b9b6467b56a95cd7617f7eb7f8f2fb5537efbfa9329126180e395"
---

## Purpose

Breadcrumb navigation primitives (`List`/`Item`/`Link`/`Page`/`Separator`/`Ellipsis`). One of the few `ui/` primitives with translated text baked in: `BreadcrumbEllipsis` pulls its sr-only "more" label from `react-i18next` rather than hardcoding English, a divergence from stock shadcn/ui.

## Connections

Uses:
- `@/lib/utils`: `cn()` for class merging.
- `@radix-ui/react-slot`: `Slot`, used by `BreadcrumbLink`'s `asChild` prop.
- `lucide-react`: `ChevronRight` (default separator icon), `MoreHorizontal` (ellipsis icon).
- `react`: `forwardRef` pattern.
- `react-i18next`: `useTranslation`, for the ellipsis's `ui.breadcrumb.more` sr-only label.

Used by:
- Not resolved in this slice — `edges_crossing_scope` is empty for `web-ui-primitives` in the extraction scope file, so no consuming feature files were provided.
