---
path: frontend/apps/web/src/api/training.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 113
size_tokens: 885
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "29e144d103f989e5f9a42533229bc5ea65666f58282178253c0e61bb77fb5c4e"
---

## Purpose

The training/exercise-library surface: exercise CRUD (`getExercises`, `getExercise`, `createExercise`, `updateExercise`, `deleteExercise`), exercise-group CRUD (`getExerciseGroups`, `createExerciseGroup`, `updateExerciseGroup`, `deleteExerciseGroup`), and `confirmClassTraining` (attach a planned exercise set to a class instance). Unlike most files in this scope, mock mode here mutates two **mutable local copies** of the mock arrays (`const mockExercises = [..._mockExercises]`, `const mockGroups = [..._mockGroups]`) so create/update/delete actually persist across calls within one page session — the comment calls this out explicitly ("Mutable local copies so in-memory CRUD works during mock mode"). Wraps `@levelup/api`'s `trainingApi`.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `frontend/apps/web/src/data/mockData.ts`: `mockExercises`, `mockExerciseGroups` (aliased, copied into local mutable state).
- `@levelup/api/src/resources/training` (outside scope): `trainingApi.*`.

Used by: no file within this scope (its consumer is the exercise-library/training-planning UI, outside `api/`/`hooks/`/`data/`).
