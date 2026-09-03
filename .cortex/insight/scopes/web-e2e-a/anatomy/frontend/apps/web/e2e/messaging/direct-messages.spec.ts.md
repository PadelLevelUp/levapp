---
path: frontend/apps/web/e2e/messaging/direct-messages.spec.ts
extracted_at: 2026-09-03T00:00:00Z
extraction_level: 2
size_lines: 256
size_tokens: 2637
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "804d6b37cf339a289f53b1c8035d1c7bc963c625e24335ed28897c4fb2908f46"
---

## Purpose

US-27/US-57 through US-64 broad coverage of the direct-messaging inbox:
viewing the conversation list, starting a new conversation, sending a
message and seeing it appear immediately (both in the message bubble and
the sidebar preview), editing and deleting a sent message via the
right-click context menu, the unread badge appearing when a second browser
context (student) sends a message and clearing when the coach opens that
conversation, and a message sent by another party while the conversation
is open auto-scrolling into view via SSE/poll. Several tests spin up a
second `browser.newContext()` to simulate the other party concurrently.

## Connections

- Uses:
  - `helpers/auth.ts`: `loginAsCoach`, `loginAsStudent`.
  - `helpers/navigation.ts`: `openMessages`.
- Used by: — (leaf spec file)
- Semantically related (not imports): `.specflow/specs/messaging/messages.spec.md`
  and `.specflow/specs/messaging/conversation-detail.spec.md`; the seeded
  coach/student conversation and its two starter messages are the shared
  fixture also read by `messaging/message-timestamp-timezone.spec.ts` and
  `messaging/participant-role-header.spec.ts` (this scope).
