---
path: frontend/packages/api/src/resources/coachLevel.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 17
size_tokens: 124
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "587a530139d1683833953b6a8f693eb24e1ddd26f3428cb6e6a498231eeabe7e"
---

## Purpose

CRUD for a coach's custom skill levels (`getCoachLevels`, `addCoachLevel`, `deleteCoachLevel`) — the level taxonomy players are assigned to (`CoachPlayer.levelId`). `deleteCoachLevel` uses `POST /app/delete/coach_level` rather than a DELETE verb, matching the same non-RESTful delete convention seen in `evaluation.ts`.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/coach_levels`, `/app/add_coach_level`, `/app/delete/coach_level`.
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `CoachLevel`.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `coachLevelApi`.
- `frontend/packages/hooks/src/queries.ts`: `useCoachLevels` wraps `getCoachLevels`.
