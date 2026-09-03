---
path: frontend/apps/web/e2e/attendance/attendance-history.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 461
size_tokens: 4499
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e1cf27061a2418c0ecd487796a7b81fe97d0fbc1b061796c0dd3b93c9816be1d"
---

## Purpose

PAD-114 E2E coverage for the "Presenças"/attendance-history sub-page (spec
`attendance.history`), the presence-only counterpart to
`absence-history.spec.ts`: chart-then-range-controls-then-list layout
order, range-preset requerying (1W/1M/1Y granularity), the recharts
zero-height-bar regression guard, a deep link from an attended-class row
into the calendar's already-open detail sheet for that exact class, the
dashboard "Attended" KPI entry point, and HTTP-layer authorization for the
endpoint.

## Connections

- Uses:
  - `helpers/api.ts`: `API_ROOT`.
  - `helpers/auth.ts`: coach/student credentials and login helpers.
- Used by: — (leaf spec file)
- Semantically related (not imports): `/api/app/attendance_history` backend
  endpoint; `.specflow/specs/attendance/history.spec.md`; shares its
  "only presences, never absences" and "chart bars must have real height"
  assertions with `attendance/absence-history.spec.ts`.
