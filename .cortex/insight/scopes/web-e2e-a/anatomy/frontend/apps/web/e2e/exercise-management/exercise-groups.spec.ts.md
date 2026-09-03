---
path: frontend/apps/web/e2e/exercise-management/exercise-groups.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 37
size_tokens: 418
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "756176672fe723142ec576caf933ae0610e28b33b7e535e01ad7c489fd791507"
---

## Purpose

US-50/US-51 baseline coverage that the `/training` hub shows a Groups
card and that a coach can create an exercise group from the dedicated
`/training/groups` page (not the hub itself), scoping to the first "New
Group" button for the same header/empty-state duplicate-label reason as
`exercise-crud.spec.ts`.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`.
  - `helpers/navigation.ts`: `openTraining`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/training/groups.spec.md`.
