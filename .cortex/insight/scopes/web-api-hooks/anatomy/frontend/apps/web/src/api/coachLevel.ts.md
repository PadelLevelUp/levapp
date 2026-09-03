---
path: frontend/apps/web/src/api/coachLevel.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 31
size_tokens: 202
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "882748399fe88631bf93aa8eb4746d3e06e555962ad36cc29125b4c177651e15"
---

## Purpose

CRUD for a coach's custom skill levels (`getCoachLevels`, `addCoachLevel`, `deleteCoachLevel`), each with a mock/real switch; mock writes `console.log` and return a synthetic object without touching a shared store. Wraps `@levelup/api`'s `coachLevelApi`.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `frontend/apps/web/src/data/mockData.ts`: `mockLevels` for the demo-mode read payload.
- `@levelup/api/src/resources/coachLevel` (outside scope): `coachLevelApi.getCoachLevels`/`addCoachLevel`/`deleteCoachLevel`.

Used by: no file within this scope (its consumer is coach-level-management UI, outside `api/`/`hooks/`/`data/`).
