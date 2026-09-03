---
path: frontend/packages/api/src/resources/availability.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 58
size_tokens: 407
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "1badf4bca3b3c8a98fe5a9cea03387124360fb681cbef27c2d2912797cb88766"
---

## Purpose

CRUD for a student's availability blockers (PAD-28): windows a student marks unavailable, which suppress AUTOMATIC class invitations during that window. Backed by the shared `CalendarBlock` model server-side (`type="unavailable"`, `blocksAutoInvitations=true`), but exposes its own narrower `AvailabilityBlocker`/`BlockerInput` shapes rather than the full calendar-block type; `deleteBlocker` always sends `{ scope: "all" }`, with no per-occurrence delete option unlike `calendar.ts`'s block endpoints.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/availability_blockers` (list/create/update) and `/app/availability_blockers/:id` (delete).

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `availabilityApi`.
- `frontend/packages/hooks/src/queries.ts`: `useAvailabilityBlockers` wraps `listBlockers`.
