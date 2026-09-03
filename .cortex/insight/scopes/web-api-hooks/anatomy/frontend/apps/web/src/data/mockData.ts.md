---
path: frontend/apps/web/src/data/mockData.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 880
size_tokens: 8233
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7027f189b5c2f26ef49c32c57ac4689ecff7de96d0fe8e557f2cf77e26dd0843"
---

## Purpose

The demo dataset backing `USE_MOCK_DATA` mode across nearly every resource wrapper in `api/*.ts` — the single largest file in this scope (880 lines) and the shared fixture almost every other `api/` file depends on for its mock branch. Exports one hand-authored fixture per domain: users/coach (`mockCoachUser`, `mockUsers`, `mockCoach`), players (`mockPlayers` derived from `mockUsers`, `mockCoachPlayers` derived from `mockPlayers`, `mockPlayerProfiles` built via local `buildProfile`/`buildNote` helpers keyed `"player-1"`…`"player-8"`), skill levels (`mockLevels`), classes/calendar (`mockClassInstances`, `mockCalendarBlocks`, `mockCalendarEvents`), attendance (`mockPresences`), dashboard KPIs (`mockDashboardStats`), evaluation categories (`mockEvaluationCategories`), messaging (`mockConversations`), a bulk-import fixture generator (`generateMockResults()`), and training content (`mockExercises`, `mockExerciseGroups`). `MOCK_COACH_ID` is the one constant used outside a fixture array, standing in for "auth in a real app" per its comment. Several fixtures are deliberately derived from earlier ones (`mockPlayers` from `mockUsers`, `mockCoachPlayers` from `mockPlayers`) to keep ids/names consistent across the whole demo dataset rather than risking drift between independently-authored arrays.

## Connections

Uses: none (leaf — only imports types from `@/types`, `@/types/training`, and `date-fns` for date helpers).

Used by:
- `frontend/apps/web/src/api/presences.ts`: `mockPresences`.
- `frontend/apps/web/src/api/training.ts`: `mockExercises`, `mockExerciseGroups` (copied into local mutable state).
- `frontend/apps/web/src/api/classes.ts`: `mockClassInstances`.
- `frontend/apps/web/src/api/dashboard.ts`: `mockDashboardStats`, `mockClassInstances`, `mockConversations`.
- `frontend/apps/web/src/api/players.ts`: `mockPlayers`, `mockCoachPlayers`, `mockPlayerProfiles`.
- `frontend/apps/web/src/api/messages.ts`: `mockConversations`.
- `frontend/apps/web/src/api/coachLevel.ts`: `mockLevels`.
- `frontend/apps/web/src/api/calendar.ts`: `mockCalendarEvents`.
- `frontend/apps/web/src/api/evaluation.ts`: `mockEvaluationCategories`.
- `frontend/apps/web/src/api/users.ts`: `mockUsers`.
- `frontend/apps/web/src/api/auth.ts`: `MOCK_COACH_ID`.
