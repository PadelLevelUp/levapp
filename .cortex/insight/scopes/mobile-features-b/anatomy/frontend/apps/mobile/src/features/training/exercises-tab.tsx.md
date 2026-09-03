---
path: frontend/apps/mobile/src/features/training/exercises-tab.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 349
size_tokens: 2787
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8afc3d4ef6f6e4bba06fdcb27874691b91b7dea610ab9872c7b3f2cfddaa81c5"
---

## Purpose

`ExercisesTab` is the exercises list-and-editor tab under Training: search + type/difficulty filters over the coach's exercise list (`FlatList`), each card opening `ExerciseForm` for edit, plus a "new exercise" entry point and a delete-confirmation `AlertDialog`. Filtering mirrors web's `TrainingExercisesPage` filter logic exactly (name substring, exact type match, exact difficulty match). Create/update/delete all go through `@levelup/hooks`' shared mutations (`useCreateExercise`/`useUpdateExercise`/`useDeleteExercise`) rather than anything feature-local, each wired to a toast on success/failure. When `formOpen` is true, the component fully swaps its render tree to `ExerciseForm` plus the delete-confirm dialog rather than layering a modal — the list and the form are mutually exclusive views of the same screen slot.

## Connections

Uses: `frontend/apps/mobile/src/features/training/exercise-form.tsx`: renders it for both create (`editing: null`) and edit, in the "form view" branch that replaces the list.

Uses (external, not in this scope): `@levelup/hooks` for `useCoachLevels`/`useCreateExercise`/`useDeleteExercise`/`useExercises`/`useUpdateExercise`; `@levelup/types` for `Exercise`/`ExercisePayload`/`DIFFICULTY_OPTIONS`/`EXERCISE_TYPE_OPTIONS`.

Used by: no in-scope file imports this tab (no in-edges in this scope's L1 data); it is presumably one of the Training screen's tab panes, alongside `groups-tab.tsx`, mounted outside this scope.
