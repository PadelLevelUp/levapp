---
path: frontend/packages/api/src/resources/presences.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 133
size_tokens: 1032
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7a96d0cbcd4595159a15854fb01c0809474dcbc4a642121832137c634632a6ed"
---

## Purpose

Attendance recording and the PAD-140 coach-facing Presences tab: `confirmClassPresences` (the calendar's class-detail sheet, taking a full `ClassInstance`) and `validateClassPresences` (the Presences tab, taking only an instance id and building a minimal payload) are thin wrappers over the SAME `/app/class_instance/presences/confirm` endpoint — recording attendance IS validating, since `add_presences` stamps `validated=true` server-side, so there is no separate "validate" call, only `unvalidateClass` to reopen one. Also: `getClassPresences`, `getPresenceStats` (coach-only, 403 otherwise), `getPresenceTrend` (gap-filled server-side), `getPendingValidation` (already-run classes split pending/validated, backing the dashboard's `pending_validations` count).

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/class_instance/presences/confirm`, `/app/class_instance/:id/presences[/unvalidate]`, `/app/presence_stats`, `/app/presence_trend`, `/app/class_instances/pending_validation`.
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `AbsenceJustification`, `ApprovalBundle`, `AttendanceGranularity`, `ClassInstance`, `PendingValidation`, `Presence`, `PresenceStats`, `PresenceStatus`, `PresenceTrend`.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `presencesApi`.

Semantically related (not imports): `frontend/packages/config/src/presence-status.ts` — the client-side present/justified/unjustified mark mapping that surfaces built on this module's endpoints use to interpret the `status`+`justification` pair.
