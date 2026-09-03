---
path: frontend/apps/web/src/components/training/ExerciseGroupFormSheet.tsx
extracted_at: 2026-09-03T14:16:04Z
extraction_level: 2
size_lines: 121
size_tokens: 1100
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b1ce04ddd9a68b168ce8e98771bf498e014e207919e1f71754242d56cd495e1c"
---

## Purpose

`ExerciseGroupFormSheet` is the create/edit form for an `ExerciseGroup` (a named, described bundle of exercises): name, description, and a scrollable checkbox list to pick which existing exercises belong to the group. Same controlled-form-reset-on-prop-change shape as `ExerciseFormSheet` (`useEffect` keyed on `[group, open]`), submitting an `ExerciseGroupPayload`.

## Connections

Uses:
- `@/components/ui/{sheet,button,input,textarea,label,checkbox}`.
- `@/types/training` (`Exercise`, `ExerciseGroup`, `ExerciseGroupPayload`).

Used by: not observed within this scope (rendered from a training-exercises page outside this scope, alongside `ExerciseGroupFolder` which displays the groups this form creates/edits).

Semantically related (not imports): mirrors `ExerciseFormSheet`'s controlled-reset-on-prop-change form shape (`useEffect` on `[entity, open]`, blank-default else clause) without sharing any code with it.
