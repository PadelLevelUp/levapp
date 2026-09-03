---
path: frontend/apps/web/src/types/training.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 2
size_tokens: 11
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d5382c1800c2f3d8c6eca085932dca6fef566313472456a728ff803717a99ef4"
---

## Purpose

A one-line re-export (`export * from "@levelup/types/src/training"`) giving the web app its `@/types/training` path-alias entrypoint for the training-domain types (`Exercise`, `ExercisePayload`, `ExerciseGroup`, `ExerciseGroupPayload`), split out from `types/index.ts`'s general domain types into their own module.

## Connections

Uses: `@levelup/types/src/training` (outside scope): re-exports its full surface.

Used by:
- `frontend/apps/web/src/api/training.ts`: `Exercise`, `ExercisePayload`, `ExerciseGroup`, `ExerciseGroupPayload`.
- `frontend/apps/web/src/data/mockData.ts`: `Exercise`, `ExerciseGroup` (for `mockExercises`/`mockExerciseGroups`).
