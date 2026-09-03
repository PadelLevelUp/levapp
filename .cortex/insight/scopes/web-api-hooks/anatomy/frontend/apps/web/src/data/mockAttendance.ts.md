---
path: frontend/apps/web/src/data/mockAttendance.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 177
size_tokens: 1461
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "a970f68c9c845d9cd85443bd2993d4e21c601794af7675e283365cf0ed0a682a"
---

## Purpose

Demo-mode payload generators for the attendance/absence history pages (PAD-114/PAD-141), deliberately mirroring the real endpoint's contract exactly (per its doc comment) so the mock can never teach the UI a response shape the server doesn't actually send: same granularity rule (`pickGranularity` — ≤31 days daily, ≤~550 days monthly, else yearly, matching the server's rule), same gap-filled bucket series (`bucketStart`/`nextBucket` walk every bucket in range, even empty ones), same `lessoninstance-<id>` deep-link shape. `buildMockAttendanceHistory` generates a handful of deterministic past-only sessions spread across the window; `buildMockAbsenceHistory` derives its payload FROM `buildMockAttendanceHistory`'s output (takes the first 3 sessions, offsets their ids by +100 so they can never collide with a mock attendance for the same class) rather than duplicating the bucket/granularity logic a second time — the doc comment explains this explicitly as the reason two real endpoints sharing one server-side service should share one client-side builder too.

## Connections

Uses: none (leaf — only imports types from `@/types`).

Used by:
- `frontend/apps/web/src/api/attendance.ts`: `buildMockAttendanceHistory` for `getAttendanceHistory`'s mock branch.
- `frontend/apps/web/src/api/absences.ts`: `buildMockAbsenceHistory` for `getAbsenceHistory`'s mock branch.
