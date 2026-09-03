---
path: frontend/packages/api/src/resources/training.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 63
size_tokens: 487
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "82c271030adc5ffba8cb80f51422956207f56fe235064c9251f1baaeb5122f61"
---

## Purpose

Training-content CRUD in three groups: exercises (`getExercises`, `getExercise`, `createExercise`, `updateExercise`, `deleteExercise`), exercise groups (`getExerciseGroups`, `createExerciseGroup`, `updateExerciseGroup`, `deleteExerciseGroup`), and per-class training confirmation (`confirmClassTraining`, links a `ClassInstance` to a set of planned exercise ids).

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/exercises[/:id]`, `/app/exercise-groups[/:id]`, `/app/class_instance/training/confirm`.
- `frontend/packages/types/src/domain.ts` and `frontend/packages/types/src/training.ts` (via `@levelup/types`): `Exercise`, `ExercisePayload`, `ExerciseGroup`, `ExerciseGroupPayload`, `ClassInstance`.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `trainingApi`.
- `frontend/packages/hooks/src/queries.ts`: every `useExercise*`/`useCreateExercise*`/`useUpdateExercise*`/`useDeleteExercise*` hook wraps a function from this module.
