---
path: frontend/apps/mobile/src/features/availability/hooks.ts
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 46
size_tokens: 385
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "51e46e56d31216c2bfdbde1178e9c75b3e1f4936e98773dd26f0ad1c2e0192b0"
---

## Purpose

TanStack Query mutation hooks (`useCreateBlocker`, `useUpdateBlocker`, `useDeleteBlocker`) for a student's availability blockers (PAD-28), each wrapping a call into `@levelup/api`'s availability resource and invalidating the shared `availabilityBlockers` query-key list on success. Delete always sends `{ scope: "all" }` — recurring blockers are removed for every occurrence, with no per-occurrence delete option, mirroring the web page. The list query itself (`useAvailabilityBlockers`) is not here — it lives in `@levelup/hooks`.

## Connections

Uses:
- `@levelup/api/src/resources/availability` (frontend/packages/api/src/resources/availability.ts): `createBlocker`, `updateBlocker`, `deleteBlocker`.
- `@levelup/hooks` (frontend/packages/hooks/src/index.ts): `queryKeys.availabilityBlockers`, used to invalidate the list after every mutation.

Used by: none within this scope — `BlockerForm.tsx` takes `onSubmit`/`onCancel` as props rather than calling these directly, so the call sites live one level up (an availability screen outside this scope).
