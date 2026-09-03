---
path: frontend/apps/web/src/api/presences.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 94
size_tokens: 730
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "7fdce049e875422b6ad79f4b3725534d569a61dcd7beb31b36e3478582f6a274"
---

## Purpose

Attendance-recording surface, split into two eras: `confirmClassPresences`/`getClassPresences` are the original per-class attendance-marking calls (with mock branches over `mockPresences`), while `getPresenceStats`/`getPresenceTrend`/`getPendingValidation`/`unvalidateClass`/`validateClassPresences` (PAD-140) back the newer coach-facing "Presences" tab and deliberately have NO mock branch — the doc comment explains `USE_MOCK_DATA` covers the demo dataset in `@/data`, which has no presence-aggregate fixtures to fake, and this tab is coach-only so it always talks to a real backend. Wraps `@levelup/api`'s `presencesApi`.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `frontend/apps/web/src/data/mockData.ts`: `mockPresences`, used only by the two older, mock-branched functions.
- `@levelup/api/src/resources/presences` (outside scope): `presencesApi.*`, and re-exports its `PresenceRangeParams` type.

Used by: no file within this scope (its consumer is the attendance-marking and Presences-tab UI, outside `api/`/`hooks/`/`data/`).
