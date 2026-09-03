---
path: frontend/apps/web/src/components/dashboard/coach/Schedule7Days.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 134
size_tokens: 1385
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "776dc67bcf1ebd6a221cfb918b82b5f1e249af492fa8b189f23fcf3c30cdc0e5"
---

## Purpose

Renders the coach dashboard's week-ahead list of classes as a 1px-gap row group (so separators are the shared group background, not doubled per-row borders). Deliberately shows no left accent bar per row (a uniform red edge on every row used to carry no information) and shows a right-edge badge only when it changes what the coach would do: amber "{n} seats"/"Empty" when under capacity, green "Full" at capacity, nothing otherwise — computed by the exported `badgeFor` helper.

## Connections

Uses: `./primitives` (`Eyebrow`, `FillBar`, `FillCount`, `StatusBadge`); `@levelup/config`'s `weekdayShort`; `@levelup/types` for `DashboardSchedule7dBlock`; `@/components/ui/button`; `react-router-dom` (`Link`, `useNavigate`).

Used by: `frontend/apps/web/src/components/dashboard/CoachDashboard.tsx` (outside this scope).

Semantically related (not imports): `dashboard/coach/NeedsYouQueue.tsx` — the sibling block encoding the same "a badge/accent only when it means something" dashboard rule.
