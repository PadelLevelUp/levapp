---
path: frontend/apps/web/src/api/absences.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 26
size_tokens: 219
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d1517456fe23470a039aab409de71e23595f82b00313ede6894f7481444488fe"
---

## Purpose

`getAbsenceHistory` (PAD-141) — the "Faltas" (missed classes) page's data source: a mock-mode/real-mode switch that returns `buildMockAbsenceHistory` in demo mode or delegates to `@levelup/api`'s `attendanceApi.getAbsenceHistory` otherwise. Structurally near-identical to `attendance.ts` (same params type, same mock/real branch shape) — the two files exist separately because they back two distinct pages (attended vs. missed classes) sharing one server-side history service.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `frontend/apps/web/src/data/mockAttendance.ts`: `buildMockAbsenceHistory` for the demo-mode payload.
- `@levelup/api/src/resources/attendance` (outside scope): `attendanceApi.getAbsenceHistory`, and re-exports its `AttendanceHistoryParams` type.

Used by: no file within this scope (its consumer is the "Faltas" page, outside `api/`/`hooks/`/`data/`).

Semantically related (not imports): `frontend/apps/web/src/api/attendance.ts` — same shape, same mock/real switch, backs the sibling "attended classes" page.
