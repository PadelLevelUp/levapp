---
path: frontend/apps/web/src/components/training/ExerciseGroupFolder.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 106
size_tokens: 869
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "381d64674ddda400f8c85fa6125410a85c4c629a56694e047dd43071b46203c7"
---

## Purpose

`ExerciseGroupFolder` is a collapsible folder row for an `ExerciseGroup`: a header (name, exercise count badge, description, hover-revealed edit/delete buttons) that expands to a responsive grid of `ExerciseCard`s for the exercises whose ids are in `group.exerciseIds`. Filters the full `exercises` array passed in against `group.exerciseIds` rather than owning any fetch of its own.

## Connections

Uses:
- `frontend/apps/web/src/components/training/ExerciseCard.tsx`: one card per exercise in the expanded group.
- `@/components/ui/{button,badge}`, `@/lib/utils` (`cn`).
- `@/types/training` (`Exercise`, `ExerciseGroup`).

Used by: not observed within this scope (rendered from a training-exercises page outside this scope, alongside `ExerciseGroupFormSheet` for editing).
