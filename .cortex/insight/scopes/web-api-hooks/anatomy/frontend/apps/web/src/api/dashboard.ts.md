---
path: frontend/apps/web/src/api/dashboard.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 120
size_tokens: 819
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a4366fee2915fc11722220b033f602b7da2953ad4f39bc3463d30c55beb58300"
---

## Purpose

`getDashboard` builds the coach home-screen's block-based `DashboardDefinition` (messages-overview, KPI grid, upcoming-classes list), delegating to `@levelup/api`'s `dashboardApi.getDashboard` in real mode or its own local `buildMockDashboard()` (by far the largest function in the file) in mock mode — hand-assembling the three dashboard blocks from `mockClassInstances`/`mockConversations`/`mockDashboardStats` with hardcoded Portuguese labels ("Alumnos", "Aulas esta semana", "Validaciones", "Ingresos"). Also exports `notifyPendingConfirmations` (PAD-78), sending a manual reminder to students still unconfirmed for tomorrow's classes; unlike every read in this file, it has no mock branch — it always calls the real endpoint.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `frontend/apps/web/src/data/mockData.ts`: `mockDashboardStats`, `mockClassInstances`, `mockConversations` for `buildMockDashboard`.
- `@levelup/api/src/resources/dashboard` (outside scope): `dashboardApi.getDashboard`/`notifyPendingConfirmations`.

Used by: no file within this scope (its consumer is the dashboard/home page, outside `api/`/`hooks/`/`data/`).
