---
path: frontend/apps/web/src/components/dashboard/blocks/PendingConfirmationsBlock.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 122
size_tokens: 975
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e8bf00a70e07fe8ddc67482d6e456a47e80050e81586c4de7330139aa0be2525"
---

## Purpose

A coach-dashboard block (PAD-78) that replaced the old "Revenue" KPI card. Shows how many students haven't yet confirmed tomorrow's classes and lets the coach fire one manual reminder to exactly that pending group — never to students who already confirmed or declined — behind an `AlertDialog` confirmation step.

## Connections

Uses: `@/api/dashboard` (outside this scope) for `notifyPendingConfirmations()`; `@/components/ui/card`, `@/components/ui/button`, `@/components/ui/alert-dialog` for layout and the confirm step; `@/hooks/use-toast` for success/error feedback; `@/types` for the `DashboardPendingConfirmationsBlock` shape.

Used by: `frontend/apps/web/src/components/dashboard/DashboardRenderer.tsx` (outside this scope) renders it for the block-driven coach dashboard.

Semantically related (not imports): sibling `dashboard/coach/*` blocks (`NeedsYouQueue.tsx`, `Schedule7Days.tsx`, `WeekPulse.tsx`) — same block-renderer pattern (`block.data` prop, `data-testid` on the root), but this one lives in `dashboard/blocks/` and is driven by the generic `DashboardRenderer` rather than the coach-specific dashboard layout.
