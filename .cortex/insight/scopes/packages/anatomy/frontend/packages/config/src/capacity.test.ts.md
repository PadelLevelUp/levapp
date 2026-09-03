---
path: frontend/packages/config/src/capacity.test.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 40
size_tokens: 280
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "09c4cd69a5eafd02a1f8a0750b317e885324e1d311c9f28d01f4730936c5ffb6"
---

## Purpose

Unit tests for `effectiveFilledSpots`: pins the ticket's worked example (6 enrolled, 3 declined → 3 filled), confirms unanswered and present players still count, and confirms the result never goes negative.

## Connections

Uses:
- `frontend/packages/config/src/capacity.ts`: `effectiveFilledSpots` under test.

Used by: none (leaf test file).
