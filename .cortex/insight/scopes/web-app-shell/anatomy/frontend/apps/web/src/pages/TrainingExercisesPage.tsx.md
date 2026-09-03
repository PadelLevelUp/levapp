---
path: frontend/apps/web/src/pages/TrainingExercisesPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 176
size_tokens: 2101
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e486dcaca4d3077e9fa93b5f9ec89ecabeb82d286bb88bd37eda31e64de0d8a2"
---

## Purpose

The coach-only `/training/exercises` page: a searchable, filterable (type, difficulty) grid of training exercises, backed by TanStack Query (`useQuery`/`useMutation`/`useQueryClient` — this is one of the few pages in this scope using React Query for data fetching rather than local `useEffect`+`useState`). CRUD via `createExercise`/`updateExercise`/`deleteExercise`, edited through `ExerciseFormSheet` and rendered as `ExerciseCard`s, with an `AlertDialog` delete confirmation.

## Connections

Uses: `@/api/training` (`getExercises`, `createExercise`, `updateExercise`, `deleteExercise`, outside this scope), `@/components/layout/AppLayout`, `@/components/training/{ExerciseCard,ExerciseFormSheet}`, `@/components/ui/{alert-dialog,button,input,select}` (all outside this scope), `@/types/training` (`EXERCISE_TYPE_OPTIONS`, `DIFFICULTY_OPTIONS`, `Exercise`, `ExercisePayload`, outside this scope), external `@tanstack/react-query`, `lucide-react`, `react`, `react-i18next`, `react-router-dom`, `sonner`.

Used by: `frontend/apps/web/src/App.tsx`, mounted at `/training/exercises` behind `RoleRoute allowedRoles={["coach"]}`.
