---
path: frontend/packages/api/src/resources/dashboard.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 28
size_tokens: 181
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "94628628f7367d12762e9ca460ddef789992b26cd9b9a0e333f82942ff8d58db"
---

## Purpose

Fetches the coach/player home-screen dashboard definition (`getDashboard`, optional `from`/`to` range) and fires the manual "notify all still-pending students" action for tomorrow's classes (`notifyPendingConfirmations`, PAD-78), returning how many instances/students were notified.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/dashboard` and `/app/dashboard/pending-confirmations/notify`.
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `DashboardDefinition` — the discriminated-union block type defined there.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `dashboardApi`.
- `frontend/packages/hooks/src/queries.ts`: `useDashboard` wraps `getDashboard`.
