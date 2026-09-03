---
path: frontend/packages/api/src/resources/attendance.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 61
size_tokens: 462
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ca4ac99a37a8acb5d8bc7cf74da5be7c3d239e8ab419370809a0b6513d98165e"
---

## Purpose

Client calls for one player's attended-class history (`getAttendanceHistory`, PAD-114) and missed-class history (`getAbsenceHistory`, PAD-141) — the "Presenças" and "Faltas" pages. Both hit sibling endpoints (`/app/attendance_history`, `/app/absence_history`) sharing one backend resolver and the same params shape; both re-authorize server-side, so a `playerId` taken from the URL must never be treated as pre-authorized on the client.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` to make both GET requests.
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `AbsenceHistory`, `AttendanceGranularity`, `AttendanceHistory` types.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `attendanceApi`.

Semantically related (not imports): `frontend/packages/api/src/resources/presences.ts` — presence data is the source both history endpoints ultimately read, though accessed via separate routes.
