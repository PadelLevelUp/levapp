---
path: frontend/apps/web/src/components/dashboard/DashboardRenderer.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 3
size_lines: 45
size_tokens: 414
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ed4fe3675bb74c32f1d59dc8a0eb00a5f42c42d172102198eb98badf9cdab9b2"
---

## Purpose

A generic, data-driven dashboard renderer: takes a server-supplied `DashboardBlock[]` and switches on each block's `type` to render the matching block component, recursing into a `"grid"` block's `children` array to build nested 1- or 2-column layouts from `block.data.cols.base`/`.lg`. Unlike `CoachDashboard.tsx` (which hand-picks four specific block types and lays them out per-breakpoint itself), this renderer trusts the server's block order and grid structure entirely — it is the "dumb" rendering path for whichever dashboard variant the backend drives structurally rather than the bespoke coach layout.

## Main players

- `renderBlock(block): React.ReactNode` (lines 8–40) — critical. The switch itself: five leaf cases each render one block component keyed by `block.id`, and a `"grid"` case recurses over `block.data.children`, mapping `cols.base`/`cols.lg` (2 or else 1) to fixed Tailwind class strings (`grid-cols-2`/`grid-cols-1`, `lg:grid-cols-2`/`lg:grid-cols-1`). Unknown block types fall through to `null` (line 38) rather than throwing.
- `DashboardRenderer({ blocks })` (lines 42–44) — critical. The exported entry point: maps the top-level `blocks` array through `renderBlock` inside a `space-y-6` column.

## Insights

- The `"grid"` case's column-class mapping only recognizes the literal value `2` for `cols.base`/`cols.lg` — any other number (e.g. `3`) silently falls back to a single column rather than erroring or scaling, so a backend payload requesting a 3-column grid here would render as 1 column with no visible error.
- `PendingConfirmationsBlock` (imported line 6, rendered line 19) is NOT a file in this scope — it lives elsewhere under `dashboard/blocks/` but was excluded from this scope's slice, unlike its four siblings (`ClassListBlock`, `KpiGridBlock`, `MessagesOverviewBlock`, `NotificationActivityBlock`) which are all in-scope. Treat it as a crossing-scope dependency, not a missing file.

## Connections

Uses: `frontend/apps/web/src/components/dashboard/blocks/ClassListBlock.tsx`, `frontend/apps/web/src/components/dashboard/blocks/KpiGridBlock.tsx`, `frontend/apps/web/src/components/dashboard/blocks/MessagesOverviewBlock.tsx`, `frontend/apps/web/src/components/dashboard/blocks/NotificationActivityBlock.tsx` — all in-scope siblings; plus `frontend/apps/web/src/components/dashboard/blocks/PendingConfirmationsBlock.tsx` — outside this scope's `files[]` (crossing-scope edge).

Used by: no file within this scope imports `DashboardRenderer`; rendered by a dashboard page (outside `web-components-a`).

## Query pointers

- If you need to add a new dashboard block type, also read: whichever `dashboard/blocks/*Block.tsx` component you're adding (props shape must match `DashboardBlock`'s discriminated union in `@/types`), then add a `case` here.
- If you need to change the nested-grid column logic, read the `"grid"` case (lines 20–36) — it only branches on `=== 2`, so extending to more column counts means rewriting this mapping, not just changing a prop.
