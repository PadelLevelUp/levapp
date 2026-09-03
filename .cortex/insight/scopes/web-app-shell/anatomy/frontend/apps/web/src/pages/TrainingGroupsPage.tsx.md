---
path: frontend/apps/web/src/pages/TrainingGroupsPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 194
size_tokens: 2424
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c1523e9e7784672c5d00c16d33bf17627e5e6cc755fa7631ee3432a30539451f"
---

## Purpose

The coach-only `/training/groups` page: organizes training exercises into named groups/folders (`ExerciseGroup`), rendered as `ExerciseGroupFolder`s with search. Also TanStack-Query-backed like its sibling `TrainingExercisesPage.tsx`, and manages CRUD for both groups (`createExerciseGroup`/`updateExerciseGroup`/`deleteExerciseGroup`) and exercises within a group (reusing `createExercise`/`updateExercise`/`deleteExercise` and `ExerciseFormSheet`), via a shared `@/api/training` module. Two independent edit/delete state pairs (`editingGroup`/`deletingGroupId` vs. `editingExercise`/`deletingExerciseId`) since either entity type can be edited from this page.

## Connections

Uses: `@/api/training` (`getExercises`, `createExercise`, `updateExercise`, `deleteExercise`, `getExerciseGroups`, `createExerciseGroup`, `updateExerciseGroup`, `deleteExerciseGroup`, outside this scope), `@/components/layout/AppLayout`, `@/components/training/{ExerciseFormSheet,ExerciseGroupFolder,ExerciseGroupFormSheet}`, `@/components/ui/{alert-dialog,button,input}` (all outside this scope), `@/types/training` (`Exercise`, `ExercisePayload`, `ExerciseGroup`, `ExerciseGroupPayload`, outside this scope), external `@tanstack/react-query`, `lucide-react`, `react`, `react-i18next`, `react-router-dom`, `sonner`.

Used by: `frontend/apps/web/src/App.tsx`, mounted at `/training/groups` behind `RoleRoute allowedRoles={["coach"]}`.
