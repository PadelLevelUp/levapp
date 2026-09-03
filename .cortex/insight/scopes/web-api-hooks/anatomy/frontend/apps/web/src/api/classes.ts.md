---
path: frontend/apps/web/src/api/classes.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 68
size_tokens: 468
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "8b2351b07079e09d1e65dcb69abfc2960bc92cd96a5f7a33fa45048a5ee0cd69"
---

## Purpose

Class-instance CRUD wrapping `@levelup/api`'s `classesApi`: `getClassInstances`/`getClassInstance` (read), `addClass`/`editClass`/`removeClass` (write). Every write mock branch just `console.log`s and returns a synthetic success object rather than mutating any shared mock store — unlike `training.ts`'s in-memory CRUD, these mock writes are not durable across calls. `getClassInstances`'s mock branch casts `mockClassInstances` (shaped like `ClassInstance`) to `CalendarEvent[]`, with a code comment noting it's a known, deliberately-unfixed shape mismatch: `mockClassInstances` was never retrofitted to match the real endpoint's `CalendarEvent` return shape because `VITE_USE_MOCK_DATA=false` in `.env`, so the mock branch doesn't run in practice.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `frontend/apps/web/src/data/mockData.ts`: `mockClassInstances` for the demo-mode read payloads.
- `@levelup/api/src/resources/classes` (outside scope): `classesApi.getClassInstances`/`getClassInstance`/`addClass`/`removeClass`/`editClass`.

Used by: no file within this scope (its consumer is the calendar/class UI, outside `api/`/`hooks/`/`data/`).
