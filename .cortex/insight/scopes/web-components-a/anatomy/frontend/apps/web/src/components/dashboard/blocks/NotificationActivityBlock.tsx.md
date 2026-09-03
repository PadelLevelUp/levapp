---
path: frontend/apps/web/src/components/dashboard/blocks/NotificationActivityBlock.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 92
size_tokens: 854
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e4d1e526ae3cd6759cd1c45d8fbceec149920f31aa4aa66411bebf3943bca1e2"
---

## Purpose

Renders a `DashboardNotificationActivityBlock` as a feed of recent notification events (manual `Send` vs auto `Bell` icon, student name, class title, round number for auto-invites, a coloured status pill via `STATUS_STYLES`, and a relative "X ago" timestamp). PAD-77: the backend emits the block title ("Notification activity") as an English literal; translated via the stable `block.id === "notification_activity"` check with a raw-title fallback for any other id sharing this block's shape.

## Connections

Uses: none within this scope; imports `@/components/ui/card`, `@/lib/utils` (`cn`), `@/types` (`DashboardNotificationActivityBlock`), `date-fns` (`formatDistanceToNow`), `lucide-react`, `react-i18next` — all outside this scope.

Used by: `frontend/apps/web/src/components/dashboard/DashboardRenderer.tsx` — rendered for the `"notification_activity"` block type.
