---
path: frontend/apps/web/src/components/dashboard/CoachDashboard.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 120
size_tokens: 1244
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "3d02877e84cd91fa9f8ec2a54c371be15bfeef0a43772011b362fb6515a9a30d"
---

## Purpose

The coach's redesigned dashboard, distinct from — and NOT the same rendering path as — `DashboardRenderer`'s generic block-switch: this component looks up exactly four named blocks (`next_class`, `needs_you`, `schedule_7d`, `week_pulse`) via the local `pick()` helper and arranges them differently per breakpoint (mobile stacks them in priority order; desktop splits into a scrolling left "work" column and a sticky right "context" column), rather than mapping an arbitrary block array in server-given order. `messages_overview` is deliberately never rendered here even though it still arrives in the dashboard payload — it only feeds the layout's unread-badge elsewhere; showing "Unread messages: 0" as the largest card on screen was the flaw this redesign specifically removed.

## Connections

Uses: `frontend/apps/web/src/components/dashboard/coach/NeedsYouQueue.tsx`, `frontend/apps/web/src/components/dashboard/coach/NextClassHero.tsx`, `frontend/apps/web/src/components/dashboard/coach/Schedule7Days.tsx`, `frontend/apps/web/src/components/dashboard/coach/WeekPulse.tsx`, `frontend/apps/web/src/components/dashboard/coach/useIsDesktop.ts` — all in `dashboard/coach/`, outside this scope's `files[]` (crossing-scope edges); plus `@levelup/config` (`greetingKey`, `longDate`, `todayISO`), `@levelup/types` (`DashboardBlock`).

Used by: no file within this scope imports `CoachDashboard`; rendered by the dashboard page (outside `web-components-a`) as the coach-facing dashboard, with `DashboardRenderer` presumably serving a different (student, or generic/legacy) dashboard variant.
