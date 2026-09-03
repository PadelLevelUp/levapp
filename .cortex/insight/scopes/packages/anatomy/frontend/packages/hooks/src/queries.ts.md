---
path: frontend/packages/hooks/src/queries.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 279
size_tokens: 1921
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0d81cb1429c5cc39ee3805217c203b9e4e41596b828a36fd5c4be9f6b8353cec"
---

## Purpose

The package's TanStack Query hook catalog: a `useQuery`/`useMutation` wrapper per resource (dashboard, calendar events, class instance, coach players paginated, player profile, conversations, unread count, coach levels, availability blockers, and the full exercise/exercise-group CRUD set). Every mutation hook invalidates its matching `queryKeys` entry `onSuccess` before forwarding to caller-supplied `onSuccess`, and every query hook accepts caller `options` (typed via the local `QueryOverrides<T>` helper) so consumers can layer `enabled`/`staleTime`/etc. on top without losing the shared `queryKey`/`queryFn` wiring.

## Connections

Uses:
- `frontend/packages/hooks/src/queryKeys.ts`: every hook's `queryKey`.
- `frontend/packages/api/src/resources/availability.ts`, `calendar.ts`, `classes.ts`, `coachLevel.ts`, `dashboard.ts`, `messages.ts`, `players.ts`, `training.ts` (via `@levelup/api/src/resources/*`): the underlying fetch/mutation functions each hook wraps.
- `frontend/packages/types/src/domain.ts` and `training.ts` (via `@levelup/types`): the response/payload types for each hook's generic.

Used by:
- `frontend/packages/hooks/src/index.ts`: wildcard re-exported (`export * from "./queries"`).
