---
path: frontend/apps/web/src/components/dashboard/blocks/KpiGridBlock.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 116
size_tokens: 1102
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "104bf6983fdc7ea8f1cfc86b437888bcd4ec842331176c3031e42f42ac08f7aa"
---

## Purpose

Renders a `DashboardKpiGridBlock` as a responsive grid of KPI tiles (players, upcoming classes, pending validation, revenue, attended/missed, etc.), each with an icon, an eyebrow label and a large display-face number. Grid column count on `sm+` tracks the actual item count (`min(items.length, 6)`) via a CSS custom property (`--kpi-cols`) instead of a fixed Tailwind breakpoint class, specifically because a hardcoded `lg:grid-cols-4` left a visibly empty quarter-row whenever the backend sent only 3 KPIs. A tile is only clickable (`role="button"`, `onClick`) when the backend supplies an `href` — PAD-76, since some KPIs have no destination page yet and must stay inert rather than 404. PAD-77: KPI labels are backend English literals, translated via a slugified-label lookup (`kpiKey` → `KPI_LABEL_KEYS`) with a raw-label fallback for anything unmapped.

## Connections

Uses: none within this scope; imports `@/components/ui/card`, `@/types` (`DashboardKpiGridBlock`, `DashboardIcon`), `lucide-react`, `react-router-dom` — all outside this scope.

Used by: `frontend/apps/web/src/components/dashboard/DashboardRenderer.tsx` — rendered for the `"kpi_grid"` block type.
