---
path: frontend/apps/mobile/src/features/training/group-form.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 161
size_tokens: 1258
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f77432b48fcf8916e18157b00ea2181fab4f062a0af4ab1090234d31649b01b2"
---

## Purpose

`GroupForm` is the exercise-group create/edit form: name, free-text description, and a checklist picker over the full exercise list to choose the group's members. It's a simpler sibling of `exercise-form.tsx` (no schema validation library — just a trimmed-name presence check) and follows the same create-vs-edit-via-nullable-prop pattern (`group: ExerciseGroup | null`) and the same delete-lifted-to-parent convention (`onDelete?` only offered while editing, parent owns the confirm dialog).

## Connections

Uses (external, not in this scope): `@levelup/types` for `Exercise`/`ExerciseGroup`/`ExerciseGroupPayload`.

Used by: `frontend/apps/mobile/src/features/training/groups-tab.tsx`: renders it for both create and edit of a group, in the "form view" branch that replaces the group list.
