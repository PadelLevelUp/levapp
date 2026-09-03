---
path: frontend/apps/web/src/api/messages.ts
extracted_at: 2026-09-03T14:14:29Z
extraction_level: 2
size_lines: 158
size_tokens: 973
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "cd3b047cc71c9824f427945ca06149a3c7e22a425f152c4587df1459d9278a6a"
---

## Purpose

The messaging feature's full client surface: conversation list/detail (`getConversations`, `getConversation`, `createConversation`, `markConversationRead`, `getUnreadMessagesCount`), message CRUD (`sendMessage`, `editMessage`, `deleteMessage`, `toggleReaction`), and moderation (`blockUser`, `unblockUser`, `getBlockedUsers`, `reportMessage`) — 13 exported functions in total, each with a mock/real switch built on `mockConversations`. Wraps `@levelup/api`'s `messagesApi`; the real-time delivery side (SSE) is handled separately by `events.ts`/`createEventSource`, not this file.

## Connections

Uses:
- `frontend/apps/web/src/api/client.ts`: imported for its `initApi()` side effect.
- `frontend/apps/web/src/data/mockData.ts`: `mockConversations` for the demo-mode payloads.
- `@levelup/api/src/resources/messages` (outside scope): `messagesApi.*` — all 13 wrapped functions.

Used by: no file within this scope (its consumer is the messaging UI, outside `api/`/`hooks/`/`data/`).

Semantically related (not imports): `frontend/apps/web/src/api/events.ts` — supplies the live SSE connection this feature's UI layers on top of.
