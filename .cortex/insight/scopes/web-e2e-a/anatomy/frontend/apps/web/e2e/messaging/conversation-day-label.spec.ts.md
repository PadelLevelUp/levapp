---
path: frontend/apps/web/e2e/messaging/conversation-day-label.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 27
size_tokens: 289
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "ae63fca3612afe00ab4075566d39ea0f969bf11f83a2281e0b1d14ccc3d60d6e"
---

## Purpose

PAD-98 regression test that the conversation list shows a day label
("Yesterday"), not merely a bare time, for a conversation whose last
message is from a previous day — exercises the seeded coach/"E2E Student
Two" conversation dated yesterday.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`.
  - `helpers/navigation.ts`: `openMessages`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/messaging/conversations.spec.md`.
