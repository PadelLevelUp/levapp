---
path: frontend/apps/web/src/components/calendar/ClassPlanningSection.tsx
extracted_at: 2026-09-03T14:16:49Z
extraction_level: 2
size_lines: 244
size_tokens: 2354
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "156957bf746015a508500affa8a5df6240a4d8bf99c530cdf27237e4a6a88a08"
---

## Purpose

The "planned exercises" panel inside `ClassDetailSheet`: lists the exercises currently planned for a class, and — while `isEditing` — offers a search/tabs dialog to add individual exercises or whole exercise groups (adding a group only inserts exercises not already planned, and disables a group once every one of its exercises is already added). Fetches its own exercise/group catalogs via `useQuery` (`getExercises`, `getExerciseGroups`); the parent (`ClassDetailSheet`) owns the actual `exerciseIds`/`onChange`/edit-mode state, so this component is a controlled picker over that list rather than an independent feature.

## Connections

Uses: none within this scope; imports `@tanstack/react-query`, `@/api/training` (`getExercises`, `getExerciseGroups`), `@/types/training` (`Exercise`), `@/components/ui/*` — all outside this scope.

Used by: `frontend/apps/web/src/components/calendar/ClassDetailSheet.tsx` — rendered with `exerciseIds={plannedExerciseIds}`, `isEditing={isPlanningMode}`, and `onEditStart={startPlanning}`.
