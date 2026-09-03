---
path: frontend/packages/types/src/training.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 105
size_tokens: 569
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "80005296b45235fb3162144c00eb95c37eb7546ea7e8cd1fb4c93d986ddaa0f2"
---

## Purpose

Training-content types: `ExerciseType`/`Difficulty` enums with paired `*_OPTIONS` label arrays for form dropdowns, the court-diagram shape (`CourtElement` — players, cones, arrows, movement lines, each with position/rotation/curve for a canvas-style editor), and `Exercise`/`ExerciseGroup` plus their `*Payload` create/update variants.

## Connections

Uses: none (leaf, no imports).

Used by:
- `frontend/packages/types/src/index.ts`: re-exported as part of the `@levelup/types` barrel.
- `frontend/packages/api/src/resources/training.ts`: `Exercise`, `ExercisePayload`, `ExerciseGroup`, `ExerciseGroupPayload`.
- `frontend/packages/hooks/src/queries.ts`: the same types, for its exercise/exercise-group hooks.
