---
path: frontend/apps/mobile/app/(tabs)/messages.tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 165
size_tokens: 1440
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "dc3111d2d512e093477bd19b0c9fbab5df3d7484fb7b9385a8ae37c6eb465c7a"
---

## Purpose

The Messages tab: conversation list with client-side name search (mirroring web's `ConversationList.tsx` filter), imperative "load more" pagination appended past react-query's cached page 1, and a FAB to start a new conversation.

## Connections

Uses:
- `@levelup/api` (`messagesApi.getConversations`), `@levelup/hooks` (`useConversations`), `@levelup/config` (`lightTheme`), `@levelup/types` (`Conversation`): outside this scope (packages).
- `@/features/messages/components/conversation-item`, `@/features/messages/utils` (`normalizeId`): outside this scope.

Used by: no file within this scope.

## Query pointers

If pagination behaves oddly, note `moreAvailable` is `null` until the first imperative `loadMore()` call — before that it defers to react-query's own `data.hasMore` for page 1.
