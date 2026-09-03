---
path: frontend/packages/config/src/presence-status.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 82
size_tokens: 739
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b3ea8b62a8992b2cead4b85eddea36a99ef127cc4a1606294a7367c252a0b03e"
---

## Purpose

PAD-140's flattening of the three states a coach records for attendance (`present` | `justified` | `unjustified`) into one `PresenceMark`, mapped both ways against the backend's two stored columns (`status` + `justification`) via `toMark`/`fromMark`. Owns the precedence chain a player row displays (`effectiveMark`: explicit coach edit > what's already stored > `prefillMark`'s policy default from the student's own RSVP) and `undecidedCount`, which gates whether a class can be validated. Lives in `@levelup/config` — not in either app — specifically because BOTH the web Presences tab/class-detail sheet and the mobile equivalents record attendance, and this module is what stops the two platforms drifting on what "justified" means.

## Connections

Uses:
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `AbsenceJustification`, `PendingValidationPlayer`, `PresenceResponse`, `PresenceStatus`.

Used by:
- `frontend/packages/config/src/index.ts`: re-exported as part of the `@levelup/config` barrel.
- `frontend/packages/config/src/presence-status.test.ts`: unit tests.

Semantically related (not imports): `frontend/packages/api/src/resources/presences.ts` — the endpoints whose `status`/`justification`/`response` fields this module's mapping functions interpret.
