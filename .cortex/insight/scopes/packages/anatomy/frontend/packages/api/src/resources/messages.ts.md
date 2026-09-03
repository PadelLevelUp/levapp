---
path: frontend/packages/api/src/resources/messages.ts
extracted_at: 2026-09-03T13:58:26Z
extraction_level: 2
size_lines: 84
size_tokens: 600
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "cee1e6b46a3bb58dd7c3919add16365fc2b3cb20ed281beed4049a8726a14aff"
---

## Purpose

Full messaging surface: paginated conversation list, single conversation fetch, unread count, send/edit/delete/react on a message, create a conversation (only 1:1 — `otherParticipants` is typed as a fixed 1-tuple), mark-read, block/unblock a user, list blocked users, and report a message. `sendMessage`'s `content` param is renamed to `text` on the wire.

## Connections

Uses:
- `frontend/packages/api/src/client.ts`: `getApi()` for `/app/conversations`, `/app/conversation[/:id[/read]]`, `/app/messages/unread_count`, `/app/message[/:id[/reaction]]`, `/app/users/:id/block`, `/app/blocked-users`, `/app/messages/:id/report`.
- `frontend/packages/types/src/domain.ts` (via `@levelup/types`): `BlockedUser`, `Conversation`, `Message`.

Used by:
- `frontend/packages/api/src/index.ts`: re-exported as `messagesApi`.
- `frontend/packages/hooks/src/queries.ts`: `useConversations`, `useConversation`, `useUnreadCount` wrap `getConversations`/`getConversation`/`getUnreadMessagesCount`.
