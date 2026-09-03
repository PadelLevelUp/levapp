---
path: frontend/apps/web/src/components/training/ExerciseFormSheet.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 186
size_tokens: 1863
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "6c438f315663f2f2bd11d1b781bf26ec95424238b05a281d027d91c94cc0e918"
---

## Purpose

`ExerciseFormSheet` is the create/edit form for a training exercise, in a slide-over `Sheet`: name, description, type (with a free-text "custom type" field when `type === "custom"`), difficulty, target coach levels (multi-select badges), the `CourtDiagramEditor` diagram, and notes. It's a controlled form reset from the `exercise` prop (or to blank defaults) via a `useEffect` keyed on `[exercise, open]`, and submits an `ExercisePayload` with empty diagrams/optional fields normalized to `undefined`.

## Connections

Uses:
- `@/components/training/CourtDiagramEditor`: the embedded tactical diagram editor.
- `@/api/coachLevel` (`getCoachLevels`, via `@tanstack/react-query`'s `useQuery`): populates the level-tagging badges — the only React Query usage in this scope (every other data-fetching component here uses raw `useEffect`+`useState`).
- `@/types/training` (`EXERCISE_TYPE_OPTIONS`, `DIFFICULTY_OPTIONS`, `ExercisePayload`, `CourtDiagram`, `Exercise`, `Difficulty`, `ExerciseType`).
- `@/components/ui/{sheet,button,input,textarea,label,select,badge}`.

Used by: not observed within this scope (opened from a training-exercises page outside this scope, passed `exercise` for edit mode or `null`/omitted for create).
