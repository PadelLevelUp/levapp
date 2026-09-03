---
path: frontend/apps/web/src/pages/DashboardPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 89
size_tokens: 701
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "33148bd929425bf937999bfbab377bc8b6100a6324a52a6e0199b4185d1ed0df"
---

## Purpose

The signed-in landing page (rendered via `HomeRoute` at `/`, or directly at `/dashboard`). Fetches a `DashboardDefinition` (`getDashboard`) for a 30-day forward window, and branches rendering on whether the response includes coach-specific block types (`needs_you`, `next_class`, `week_pulse`): if so it renders the newer `CoachDashboard` (no in-page "Dashboard" heading — the greeting itself is the page's orientation); otherwise it falls back to the generic `DashboardRenderer` for the older player-dashboard block shape, under an explicit `t("dashboard.title")` heading. Also extracts a `messages_overview` block (if present) to push unread count and latest-message data into `LayoutContext` via `setUnreadCount`/`setLatestMessage` (note: `setUnreadCount` is called twice in a row for the same block — a minor redundancy, not two different code paths).

## Connections

Uses: `@/api/dashboard` (`getDashboard`, outside this scope), `@/auth/AuthContext` (`useAuth`, this scope), `@/components/dashboard/{CoachDashboard,DashboardRenderer}` (outside this scope), `@/components/layout/AppLayout`, `@/components/layout/LayoutContext` (`useLayout`, outside this scope), `@/components/ui/loading-skeleton` (`LoadingDashboard`, outside this scope), `@/types` (`DashboardDefinition`, outside this scope), external `react`, `react-i18next`.

Used by: `frontend/apps/web/src/App.tsx` (mounted at `/dashboard` behind `ProtectedRoute`) and `frontend/apps/web/src/auth/HomeRoute.tsx` (rendered at `/` for authenticated users).
