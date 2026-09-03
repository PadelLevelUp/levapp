---
path: frontend/apps/mobile/src/features/presences/hooks.ts
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 111
size_tokens: 881
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "93c673439efcc743c0f69aefb9ba023509d6f8efad03ab070ffc639f4c2c026c"
---

## Purpose

PAD-140 feature-local hooks for the mobile Presences tab: query hooks for stats/trend/pending-validation, mutations to validate or unvalidate a class's attendance, and a `weekBounds(offset)` helper computing Monday–Sunday date ranges. The file's own comment notes the API layer is already shared (`@levelup/api/resources/presences`), so this module is pure query/mutation wiring — the web shell drives the same endpoints through its own `useState`/`useEffect` loop, but both platforms call the identical resource functions, so request shape cannot drift between them.

## Connections

Uses (external, not in this scope): `@levelup/api/src/resources/presences` for all network calls (`getPresenceStats`, `getPresenceTrend`, `getPendingValidation`, `validateClassPresences`, `unvalidateClass`); `@levelup/types` for `AbsenceJustification`/`PresenceStatus`.

Used by:
- `frontend/apps/mobile/src/features/presences/PresencesScreen.tsx`: imports `usePendingValidation`, `usePresenceStats`, `useUnvalidateClass`, `useValidateClasses`, `weekBounds`.
- `frontend/apps/mobile/src/features/presences/ValidateClassesSheet.tsx`: imports the `ValidatePayload` type.
