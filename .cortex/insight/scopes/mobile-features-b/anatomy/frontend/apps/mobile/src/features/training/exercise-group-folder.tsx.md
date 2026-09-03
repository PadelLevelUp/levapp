---
path: frontend/apps/mobile/src/features/training/exercise-group-folder.tsx
extracted_at: 2026-09-03T14:12:18Z
extraction_level: 2
size_lines: 189
size_tokens: 1705
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "66a06770d3b8f1ef3c96004dc495078aea1650f758b9264609aaf26a0abbee0d"
---

## Purpose

`ExerciseGroupFolder` is an expandable card mirroring web's `ExerciseGroupFolder.tsx`: a header row (chevron + folder icon + name/exercise-count badge, plus edit/delete icons) that toggles an inline list of the group's member exercises, each with its own edit/delete affordance. All edit/delete callbacks for both the group and its member exercises are lifted to the parent (`groups-tab.tsx`, mirroring how web lifts them to `TrainingGroupsPage`) — this component never touches `exercise-form.tsx` or any exercise mutation itself, it's purely presentational plus toggle state. A found-via-Maestro accessibility bug is documented and fixed here: the toggle Pressable and the edit/delete icon Pressables are kept as SIBLINGS rather than nested, because a Pressable wrapping other Pressables collapses the whole subtree into one accessible element on iOS — the edit icon was visually present but unreachable by `accessibilityLabel` for both VoiceOver and Maestro while nested inside the toggle.

## Connections

Uses (external, not in this scope): `@levelup/types` for `Exercise`/`ExerciseGroup`; `@levelup/config` for `lightTheme`.

Used by: `frontend/apps/mobile/src/features/training/groups-tab.tsx`: renders one `ExerciseGroupFolder` per group in the list, wiring `onEditGroup`/`onDeleteGroup`/`onEditExercise`/`onDeleteExercise` to its own form-open/confirm-dialog state.
