---
path: frontend/apps/web/e2e/messaging/participant-role-header.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 39
size_tokens: 373
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b3a9206aa481472ce8fc4aa425f7961528d7eeaf0f5c2cd2e2651e555c20bb0f"
---

## Purpose

PAD-31 regression test that the chat header subtitle shows the other
participant's actual role — a student opening the seeded conversation with
the coach must see "Coach" in the header, never the previously hardcoded
"Player".

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsStudent`.
  - `helpers/navigation.ts`: `openMessages`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/messaging/conversation-detail.spec.md`.
