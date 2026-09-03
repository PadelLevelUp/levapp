---
path: frontend/apps/mobile/src/features/training/groups-tab.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 3
size_lines: 340
size_tokens: 2822
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d7f09d56728cfb9ae8ed80b641a0150030e4e53098dc3855506ff84e07702925"
---

## Purpose

`GroupsTab` is the exercise-groups list-and-editor tab under Training: a searchable list of `ExerciseGroupFolder` cards (search matches on group name OR any member exercise's name, mirroring web's `TrainingGroupsPage`), a create/edit `GroupForm`, and — because `ExerciseGroupFolder` lifts its per-exercise edit/delete callbacks up here — a SECOND inline flow for editing or deleting one member exercise via the same `ExerciseForm` and mutation hooks `exercises-tab.tsx` uses, without leaving the Groups tab. This makes it the most stateful file in the scope: it owns two entirely parallel form-open/editing/confirm-delete state triples (one for groups, one for the inline exercise edit) plus their own `AlertDialog`s.

## Main players

- `GroupsTab` (lines 54–339) — critical. The tab component. Owns `formOpen`/`editing`/`confirmingDelete` for the group form, and a second, independent `exerciseFormOpen`/`editingExercise`/`confirmingDeleteExercise` triple for the inline exercise-edit flow reached from within a folder.
- `filtered` (`useMemo`, lines 77–87) — supporting. Search matching mirrors web's `TrainingGroupsPage`: matches the group's own name, OR looks up each member exercise by id in the full `exercises` list and matches its name.
- `handleSubmit` / `handleExerciseSubmit` (lines 114–125, 147–153) — supporting. Two independent create/update dispatchers — `handleExerciseSubmit` has no create branch (`if (!editingExercise) return`), because inline exercise creation isn't offered from within a group folder, only edit and delete are.
- Two `AlertDialog`s (lines 262–296, 300–336) — supporting. Structurally identical but bound to different mutations/state, one for group delete (reachable from a folder's trash icon OR from `GroupForm`'s own delete action) and one for exercise delete (reachable the same two ways, for the inline exercise flow).

## Insights

- The three-way render switch at the top (`exerciseFormOpen ? <ExerciseForm> : formOpen ? <GroupForm> : <the list>`) means the inline exercise-edit form takes priority over the group form if both flags were somehow true — in practice they can't be, since opening one always goes through a handler that only sets one triple of state, but the order encodes that priority intentionally.
- This file duplicates `exercises-tab.tsx`'s exercise mutation wiring (`useUpdateExercise`/`useDeleteExercise`, `handleExerciseSubmit`) rather than importing shared logic from it — the two tabs each own an independent instance of the same mutations because there is no shared "exercise editor" hook, only the shared `ExerciseForm` component and the shared `@levelup/hooks` mutation hooks themselves.
- `onDeleteExercise` on `ExerciseGroupFolder` receives an exercise `id`, but this file re-looks-up the full `Exercise` object from the `exercises` list before opening the confirm dialog (`exercises.find((e) => e.id === id)`) — the delete confirmation and the eventual `deleteExerciseMut.mutate(editingExercise.id, ...)` both need the object, not just the id, because `editingExercise` is also what `ExerciseForm` receives when reused for this inline edit.

## Connections

Uses:
- `frontend/apps/mobile/src/features/training/exercise-form.tsx`: reused for the inline "edit a group's member exercise" flow (no create path here).
- `frontend/apps/mobile/src/features/training/exercise-group-folder.tsx`: one instance per group in the `FlatList`.
- `frontend/apps/mobile/src/features/training/group-form.tsx`: the group create/edit form.

Uses (external, not in this scope): `@levelup/hooks` for `useCoachLevels`/`useCreateExerciseGroup`/`useDeleteExercise`/`useDeleteExerciseGroup`/`useExerciseGroups`/`useExercises`/`useUpdateExercise`/`useUpdateExerciseGroup`; `@levelup/types` for `Exercise`/`ExerciseGroup`/`ExerciseGroupPayload`/`ExercisePayload`.

Used by: no in-scope file imports this tab (no in-edges in this scope's L1 data); presumably one of the Training screen's tab panes, alongside `exercises-tab.tsx`, mounted outside this scope.

## Query pointers

If you need to change how a group's member exercises are edited/deleted inline, this file (not `exercise-group-folder.tsx`) owns that logic — the folder only surfaces the callbacks.
If you need to change exercise creation/edit/delete behavior generally, check both this file and `exercises-tab.tsx` — they each independently wire the same `@levelup/hooks` mutations and will drift if only one is updated.
If you need to change the group form fields themselves, go to `group-form.tsx`.
