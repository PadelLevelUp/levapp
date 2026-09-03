---
path: frontend/apps/web/e2e/exercise-management/exercise-crud.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 103
size_tokens: 1167
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2ca59d335c4599dde0774ccc32b55260bed2f467fd18391eaef3c3c11b8fce2d"
---

## Purpose

US-16/US-18/US-48/US-49 baseline create/delete/edit/filter coverage for
the exercises library: create scopes to the first "New Exercise" button (a
second one renders in the empty state with the same accessible name),
delete hovers the specific ExerciseCard to reveal its `Trash2` button and
confirms via an AlertDialog, and edit explicitly waits for the create
sheet's dialog to fully close before clicking the card — a still-closing
Radix overlay can otherwise swallow the click and the edit sheet never
opens.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`.
  - `helpers/navigation.ts`: `openExercises`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/training/exercises.spec.md`;
  project memory flags the "class delete" case as fragile-route-mock and
  the US-16/US-48 cases as historically flaky/broken on origin/main —
  check current status before treating a failure here as a regression.
