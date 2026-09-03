---
path: frontend/apps/web/src/types/index.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 2
size_tokens: 11
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "0fbdd7060864f16368663fcca84cc87f8cf04eb4bfa64841da66b4de9b807b9c"
---

## Purpose

A one-line re-export (`export * from "@levelup/types/src/domain"`) giving the web app its `@/types` path-alias entrypoint for every domain type (`Player`, `CoachPlayer`, `ClassInstance`, `Conversation`, `Message`, `Presence`, etc.). This is the app's real, current type system — unrelated to the dead Supabase-generated `Database` types in `integrations/supabase/types.ts`.

## Connections

Uses: `@levelup/types/src/domain` (outside scope): re-exports its full surface.

Used by: the overwhelming majority of files in `api/` and `data/` in this scope (`absences.ts`, `attendance.ts`, `calendar.ts`, `classes.ts`, `coachLevel.ts`, `dashboard.ts`, `evaluation.ts`, `messages.ts`, `players.ts`, `presences.ts`, `seasons.ts`, `training.ts`, `users.ts`, `mockAttendance.ts`, `mockData.ts`) via the `@/types` import — for type-only imports of the domain shapes each module deals in.
