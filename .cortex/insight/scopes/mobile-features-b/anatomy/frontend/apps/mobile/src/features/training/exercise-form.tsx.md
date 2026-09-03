---
path: frontend/apps/mobile/src/features/training/exercise-form.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 314
size_tokens: 2593
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0635e3004f1f46732555faf9eb6865e04147c59afb695dc03b509bba7c84afe5"
---

## Purpose

`ExerciseForm` is the exercise create/edit form, mirroring web's `ExerciseFormSheet`: name, type (with a custom-type field when `type === "custom"`), difficulty (1–5 Pressable row), free-text description/notes, a level-picker checklist, and the court diagram editor collapsed behind a toggle (collapsed by default to keep the form compact). Validation runs through the shared `@levelup/validation` `exerciseFormSchema` (zod), and a failed parse resolves its error message through `t(raw, {defaultValue: raw})` so a raw Zod message still renders something even if no matching i18n key exists yet. `EXERCISE_TYPE_OPTIONS`/`DIFFICULTY_OPTIONS` (from `@levelup/types`) ship English labels, so this file explicitly re-translates off their stable `.value` rather than using the shipped `.label`.

## Connections

Uses: `frontend/apps/mobile/src/features/training/court-diagram-editor.tsx`: renders it inside a collapsible section, wired to local `diagram` state that's merged into the submitted payload.

Uses (external, not in this scope): `@levelup/types` for `Exercise`/`ExercisePayload`/`ExerciseType`/`Difficulty`/`CourtDiagram`/`DIFFICULTY_OPTIONS`/`EXERCISE_TYPE_OPTIONS`; `@levelup/validation`'s `exerciseFormSchema`.

Used by:
- `frontend/apps/mobile/src/features/training/exercises-tab.tsx`: renders it for both create and edit, swapping in the exercise being edited.
- `frontend/apps/mobile/src/features/training/groups-tab.tsx`: renders it twice — once for creating/editing a group's member exercise inline from within a folder (edit-only there, no create path), reusing the same form and its own delete-confirmation flow as `exercises-tab.tsx`.
