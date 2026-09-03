---
path: frontend/packages/api/src/resources/classes.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 72
size_tokens: 548
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "147d5190676ce54d24e55d54c07300fb0eb8e10e8538c3f08f9766718dd75fa7"
---

## Purpose

CRUD for classes: `getClassInstances` (calendar-shaped listing for a date range — despite the name, hits `/app/lesson_instances` and returns `CalendarEvent`-serialized rows, not full `ClassInstance` objects; was mistyped as `ClassInstance[]` for a while and fixed), `getClassInstance` (full detail for one occurrence), `addClass`, `removeClass`, `editClass` (the latter two scoped `single`/`future` for recurring series). Per PAD-80, `/app/lesson_instances` is registered GET-only server-side; it used to be POSTed, which 405'd silently and made the player-profile "Add to classes" picker always render empty.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/lesson_instances`, `/app/class_instance`, `/app/add_class`, `/app/remove_class`, `/app/edit_class`.
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `CalendarEvent`, `ClassInstance`.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `classesApi`.
- `frontend/packages/hooks/src/queries.ts`: `useClassInstance` wraps `getClassInstance`.
