---
path: frontend/apps/mobile/app/(tabs)/dashboard.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 71
size_tokens: 629
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ea0f89b6dc16b65392c3d44d10d44626234ddef484f95af089ef7d8054a050b1"
---

## Purpose

The Dashboard tab: fetches a fixed now→+30-day block window (matching web's dashboard) and renders either `CoachDashboard` (the current block-shape) or the legacy `DashboardBlocks` (older player-dashboard block types), selected via the `isCoachDashboard` type guard. No in-screen title — the tabs layout's navy app bar carries the greeting instead.

## Connections

Uses:
- `@/features/dashboard/CoachDashboard` (`CoachDashboard`, `isCoachDashboard`), `@/features/dashboard/DashboardBlocks`: outside this scope.
- `@levelup/hooks` (`useDashboard`): outside this scope (packages).

Used by: no file within this scope.
