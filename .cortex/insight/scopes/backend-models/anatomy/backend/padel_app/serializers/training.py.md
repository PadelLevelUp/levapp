---
path: backend/padel_app/serializers/training.py
extracted_at: 2026-09-03T14:05:38Z
extraction_level: 2
size_lines: 26
size_tokens: 238
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "d4cc03b1802609c9a9066c30c2f767b6fc844990e5d41320c3259d80863e535c"
---

## Purpose

`serialize_exercise`/`serialize_exercise_group`: camelCase flat dicts for Exercise/ExerciseGroup (ids stringified; exerciseIds is a list of stringified ids for a group). Duck-typed, no imports.

## Connections

Uses:
- (none within this scope)

Used by:
- (none within this scope)

Semantically related (not imports):
- backend/padel_app/models/exercise.py: reads Exercise/ExerciseGroup fields directly, including the exercises M2M for exerciseIds
