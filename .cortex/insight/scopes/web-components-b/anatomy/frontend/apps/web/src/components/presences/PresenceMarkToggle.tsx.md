---
path: frontend/apps/web/src/components/presences/PresenceMarkToggle.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 84
size_tokens: 751
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "4e5b9fb818accaa8d449a10b32677db07b1ce4d0763d8472c88abd6e2abe5662"
---

## Purpose

A three-way present/justified/unjustified toggle group (PAD-140) for marking attendance across many players/classes in a compact scrolling dialog. Its own comment states it is SEMANTICALLY IDENTICAL to `AttendanceRow`'s controls in the class-detail sheet (outside this scope) — both write the same `status`+`justification` pair through the shared mapping in `@levelup/config` — but presents differently on purpose: `AttendanceRow` has room for avatar/badges/tooltips per single player in a roomy sheet, this one renders dozens of players compactly. Deliberately has NO "clear" affordance — once marked, the only way back is picking a different answer, not reopening the question.

## Connections

Uses: `@/lib/utils` (`cn`); `@levelup/config` (`PresenceMark` type only).

Used by: `frontend/apps/web/src/components/presences/ValidateClassesDialog.tsx` (outside this scope, per `edges_crossing_scope`).

Semantically related (not imports): `AttendanceRow` (outside this scope, in the class-detail sheet) — the parallel single-player control writing the same underlying `status`/`justification` state via `@levelup/config`'s shared mapping.
