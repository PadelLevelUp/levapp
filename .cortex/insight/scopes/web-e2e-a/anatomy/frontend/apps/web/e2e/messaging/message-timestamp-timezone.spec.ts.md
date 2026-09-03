---
path: frontend/apps/web/e2e/messaging/message-timestamp-timezone.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 68
size_tokens: 670
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "f6476c53ff0e237c968f2e13e01b86e7ec8870514f7883efdbec5199ab068118"
---

## Purpose

PAD-33 regression test pinned at the API-contract level
(timezone-independent): every message `timestamp` and every conversation
`lastMessageAt` must carry an explicit UTC offset (`Z` or `±HH:MM`). The
original bug serialized a naive-UTC `sent_at` via a bare `.isoformat()`
with no offset, so the browser's `new Date(iso)` parsed it as local time
and a Lisbon viewer saw times an hour behind.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`.
  - `helpers/navigation.ts`: `openMessages`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/messaging/messages.spec.md`;
  project memory flags this spec as known-flaky in full suite runs
  (passes isolated), unrelated to messaging-file changes.
