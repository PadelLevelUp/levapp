---
path: frontend/apps/mobile/src/features/players/hooks.ts
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 3
size_lines: 271
size_tokens: 2151
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7fb965545a7ef46150f96fb95866c7775f33213928b9732a75615ab01c59b177"
---

## Purpose

Feature-local React Query hooks for the mobile Players screens: the file's own doc comment explains its scope precisely — query hooks that already exist in `@levelup/hooks` (`useCoachPlayersPaginated`, `usePlayerProfile`, `useCoachLevels`) are used directly from there, and this module only adds what's missing: the unpaginated full-roster lookup, player/note mutations, evaluation-category fetch + entry posting, the standing-waiting-list CRUD, and a week-ranged class-instances query for the "add to classes" flow. It is the shared mutation/query hub for the entire mobile Players feature.

## Main players

- `coachPlayersKey` (const, line 25) — critical. Query key for the unpaginated roster; also the anchor other hooks invalidate against.
- `useCoachPlayers` (lines 28–33) — critical. Full (unpaginated) roster query, used by the detail screen to locate one player by id — the paginated hook can't do a direct id lookup.
- `usePlayersInvalidation` (lines 36–51, unexported) — critical. Shared invalidation helper every mutation below calls on success: invalidates the paginated-list prefix, the full roster key, and (if a `playerId` is given) the player-profile query — normalizing the id to a string since the API serializes it as a number while route params are strings.
- `AddPlayerPayload` (interface, lines 55–64) / `useAddPlayer` (lines 66–72) — critical. POST `/app/add_player`; note comment: no `username` field (PAD-105 — the player picks their own username at activation).
- `useCreateIncompletePlayer` (lines 87–94) — critical. PAD-135: POST `/app/incomplete_player`, the "create & invite" counterpart to `useAddPlayer` — creates the player *and* a single-use `PlayerInvitation`, returning a shareable link. Fixes a real bug: `addPlayer` never returned a token, so the old mobile create screen had no invite link to show.
- `EditPlayerUpdates` (interface, lines 97–105) / `useEditPlayer` (lines 107–119) — critical. POST `/app/edit_player`.
- `useRemovePlayer` (lines 121–133), `useAddCoachNote` (135–149), `useDeleteCoachNote` (151–158) — supporting. Player removal and strength/weakness coach-note CRUD, each invalidating via `usePlayersInvalidation`.
- `evaluationCategoriesKey` (const, line 162) / `useEvaluationCategories` (lines 170–176) — supporting. Deliberately lazy (`enabled` param) — mirrors web's `handleOpenEval`, fetching categories only once the "Add Evaluation" sheet opens rather than eagerly.
- `usePostEvaluationEntry` (lines 178–193) — critical. Posts one evaluation entry and invalidates the player-profile query (evaluations are read off `profile.evaluations`, not a separate query).
- `standingWaitingListKey` (const, line 197) / `useStandingWaitingList` (206–211) / `useAddToStandingWaitingList` (213–234) / `useRemoveFromStandingWaitingList` (236–245) — supporting. No per-player lookup endpoint exists (web does the same); consumers `.find()` against the full list.
- `useClassInstancesForWeek` (lines 260–270) — critical. Groundwork for "Add to Classes": no equivalent existed in `calendar/hooks.ts` at the time this was written (checked explicitly per the comment). Returns `CalendarEvent[]`, NOT `ClassInstance[]` — `getClassInstances` hits `/app/lesson_instances`, which serializes CalendarEvent-shaped rows (title/participantCount/model/originalId). The comment flags this was mistyped for a while (see `found_issues.md`).

## Insights

- This file is explicitly NOT meant to duplicate `@levelup/hooks` — its own top-of-file comment states the split rule (shared query hooks live in the package; this file adds only what's missing). Anyone adding a new players hook should check `@levelup/hooks` first before adding it here.
- Two historical bugs are recorded directly in the comments as context for future changes: (1) `useCreateIncompletePlayer` exists because `useAddPlayer`'s endpoint never returned an invite token; (2) `useClassInstancesForWeek`'s return type was wrong for a while (typed as `ClassInstance[]` when the endpoint actually returns `CalendarEvent[]`).
- Player-id type mismatch is a recurring theme: the API serializes `playerId` as a number in some contexts while route params/query keys are strings — `usePlayersInvalidation` and evaluation invalidation both explicitly `String()`-coerce to avoid stale-cache misses.

## Connections

Uses (external, not in this scope): `@levelup/api/src/resources/{players,playerInvitations,evaluation,notificationEngine,classes}` for all network calls; `@levelup/hooks` for `queryKeys.playerProfile`; `@levelup/types` for `CalendarEvent`, `CoachNote`, `CoachPlayer`, `EvaluationEntryPayload`.

Used by:
- `frontend/apps/mobile/src/features/players/add-to-classes-dialog.tsx`: imports `useClassInstancesForWeek`.
- `frontend/apps/mobile/src/features/players/waiting-list-dialog.tsx`: imports `useAddToStandingWaitingList`.
- (outside this scope, per crossing edges) `frontend/apps/mobile/src/features/players/StrengthsWeaknesses.tsx` and `frontend/apps/mobile/src/features/players/add-evaluation-form.tsx` both import from this file — likely `useAddCoachNote`/`useDeleteCoachNote` and `useEvaluationCategories`/`usePostEvaluationEntry` respectively, based on their names, though the exact hooks used aren't visible from this scope's data.

## Query pointers

If you need to add a players mutation or query, add it here — but first check `@levelup/hooks` to avoid duplicating an existing shared hook.
If you need the "Add to Classes" flow, read `add-to-classes-dialog.tsx` next — it's the only in-scope consumer of `useClassInstancesForWeek`.
If you're touching evaluation entry submission or coach notes, also read the two out-of-scope consumers named above (`StrengthsWeaknesses.tsx`, `add-evaluation-form.tsx`) since they're the actual UI callers of those hooks.
