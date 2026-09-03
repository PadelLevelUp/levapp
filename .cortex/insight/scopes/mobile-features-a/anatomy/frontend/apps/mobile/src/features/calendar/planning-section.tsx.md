---
path: frontend/apps/mobile/src/features/calendar/planning-section.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 330
size_tokens: 3112
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "74826bc90b297021aa74486d4bfe2ad7aedead99e3f53dda7dd1ecc2362c0770"
---

## Purpose

Class training-plan section: a read-only list of planned exercises with an "Edit" trigger; in edit mode, exercises can be removed inline or added through a picker dialog with "Exercises"/"Groups" tabs and a shared search box. Ports web's `ClassPlanningSection.tsx`. Adding a group dedupes against exercises already on the plan (`addGroup` filters out ids already present), and a fully-already-added group renders disabled with a "0 new" state rather than being hidden.

## Connections

Uses:
- `@levelup/hooks` (frontend/packages/hooks/src/index.ts): `useExerciseGroups`, `useExercises`.
- `@levelup/types` (frontend/packages/types/src/index.ts): `DIFFICULTY_OPTIONS`, `EXERCISE_TYPE_OPTIONS`, `Exercise`.
- `@levelup/config` (frontend/packages/config/src/index.ts): `lightTheme`.
- `@/components/ui/{badge,button,dialog,input,tabs,text}` (outside this scope).

Used by: none within this scope — rendered inside a class-detail screen outside this slice, alongside `ParticipantRow.tsx`.
