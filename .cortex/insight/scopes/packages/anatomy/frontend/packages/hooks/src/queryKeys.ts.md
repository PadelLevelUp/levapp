---
path: frontend/packages/hooks/src/queryKeys.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 30
size_tokens: 353
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ff3dcd6b15a85df58af6030134c52f50ba8f7094fc224db74fb684dd4e6dac7b"
---

## Purpose

Central TanStack Query key registry (`queryKeys`). Deliberately kept BYTE-IDENTICAL to the inline key strings the web app historically used ("exercises", "exercise-groups", "coach_levels", "messages-unread-count", …) rather than renamed to a cleaner scheme, specifically so cache invalidation stays consistent across platforms during the migration to this shared package — a renamed key here would silently stop invalidating any not-yet-migrated inline `["exercises"]` call elsewhere in the app.

## Connections

Uses:
- `frontend/packages/api/src/resources/players.ts` (via `@levelup/api/src/resources/players`): `PlayersQueryParams` type for `coachPlayersPaginated`.
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `CalendarEvent` type for `classInstance`.

Used by:
- `frontend/packages/hooks/src/index.ts`: re-exported by name.
- `frontend/packages/hooks/src/queries.ts`: every hook's `queryKey`.
- `frontend/packages/hooks/src/queryKeys.test.ts`: pins the exact key shapes.
