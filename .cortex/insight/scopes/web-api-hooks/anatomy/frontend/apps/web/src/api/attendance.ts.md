---
path: frontend/apps/web/src/api/attendance.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 25
size_tokens: 219
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c36563afc41e2b8fe28fb11fea87965626e736992b6a74ae976b466ab53b8ef4"
---

## Purpose

`getAttendanceHistory` (PAD-114) — the attended-classes history page's data source: mock mode returns `buildMockAttendanceHistory`, real mode delegates to `@levelup/api`'s `attendanceApi.getAttendanceHistory`. The `playerId` a caller passes is never trusted client-side per the docstring; the server re-authorizes the subject (self, or a coach's own roster) and 403s otherwise.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `frontend/apps/web/src/data/mockAttendance.ts`: `buildMockAttendanceHistory` for the demo-mode payload.
- `@levelup/api/src/resources/attendance` (outside scope): `attendanceApi.getAttendanceHistory`, and re-exports its `AttendanceHistoryParams` type.

Used by: no file within this scope (its consumer is the attendance-history page, outside `api/`/`hooks/`/`data/`).

Semantically related (not imports): `frontend/apps/web/src/api/absences.ts` — same shape, same mock/real switch, backs the sibling "missed classes" page and shares the same `buildMockAttendanceHistory` base data via `mockAttendance.ts`.
