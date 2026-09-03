---
path: frontend/apps/web/src/components/dashboard/blocks/MessagesOverviewBlock.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 83
size_tokens: 671
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "34d882e827db3135a75a2649866cc2887c4732d07593624dbae164c7d131e486"
---

## Purpose

Renders a `DashboardMessagesOverviewBlock` as three cards — unread-message count, latest message preview (hidden below `md`), conversations-awaiting-reply count — all clicking through to the same `block.data.href` (the messages page). Per `CoachDashboard.tsx`'s comment, this exact block type is the one the coach-dashboard redesign deliberately stopped rendering ("Unread messages: 0" as the largest card on screen), so this component's live usage is likely limited to `DashboardRenderer`'s generic/other dashboard path rather than the coach dashboard.

## Connections

Uses: none within this scope; imports `@/components/ui/card`, `@/types` (`DashboardMessagesOverviewBlock`), `react-i18next`, `react-router-dom` — all outside this scope.

Used by: `frontend/apps/web/src/components/dashboard/DashboardRenderer.tsx` — rendered for the `"messages_overview"` block type.
