---
path: frontend/packages/types/src/domain.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 935
size_tokens: 6585
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "19c1357c772e4df09b2ee8a0b0898db996a0c177ad2c966398655b89c5dd466d"
---

## Purpose

The core domain type vocabulary for the whole app — by far the largest file in the scope (935 lines) despite carrying no runtime logic beyond `sideLabel`. Covers classes/instances/presences/calendar events, the messaging model, the full dashboard block discriminated union (`DashboardBlock` and its ~9 variants), the notification-engine's config/timing/invitation-group/approval-bundle types, and the PAD-114/PAD-140/PAD-141 attendance-history and presence-stats families (`AttendanceHistory`/`AbsenceHistory` sharing a base shape via `Omit`/`extends` since they're one backend code path selecting a different `Presence.status`). Every resource module in `frontend/packages/api/src/resources/` and every hook in `frontend/packages/hooks/src/` is typed against this file — it is the load-bearing shared vocabulary the rest of the scope compiles against.

## Connections

Uses: none (leaf, no imports).

Used by: effectively every other file in this scope via `@levelup/types` — notably every `frontend/packages/api/src/resources/*.ts` module, `frontend/packages/hooks/src/queries.ts` and `queryKeys.ts`, `frontend/packages/config/src/calendar-status.ts` and `presence-status.ts`, and `frontend/packages/types/src/index.ts` (re-exports it).
