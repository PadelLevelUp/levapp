---
path: frontend/apps/mobile/src/features/messages/utils.ts
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 3
size_lines: 78
size_tokens: 650
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2489ed836867d9c80841a2c50d32b179c4733dc751ee8663c1a7504472ce68bb"
---

## Purpose

Small pure/query-cache helper library shared by every messages component in this scope: id normalization, cache read-modify-write helpers for the conversation/message TanStack Query cache, list-invalidation, and display formatters (message-bubble timestamp, conversation-list timestamp, avatar initials). This is the single place that knows the shape of the cached `Conversation`/`Message` objects.

## Main players

- `normalizeId` (lines 7–12, supporting): coerces a conversation id to `string`, because the backend mixes string/number ids for conversations.
- `updateConversationCache` (lines 18–27, critical): the base cache-write primitive — applies an `updater(conversation)` function to the cached conversation for `queryKeys.conversation(conversationId)` via `queryClient.setQueryData`; a no-op when nothing is cached yet.
- `updateMessageInCache` (lines 30–42, critical): built ON TOP of `updateConversationCache` — maps over `conversation.messages` and applies `updater` to the one matching `messageId` (compared as strings). This is the only place that knows how to reach into the messages array; any change to the conversation cache shape must update this function too.
- `invalidateMessagesLists` (lines 45–48, supporting): invalidates both `queryKeys.unreadCount` (badge) and the `["conversations"]` list query — the two things that go stale after any message-list-affecting mutation.
- `formatMessageTime` (lines 51–55, critical): in-bubble timestamp, always rendered in the LOCAL timezone (PAD-33 — a prior UTC-offset bug).
- `formatConversationTime` (lines 58–66, critical): conversation-list timestamp — time-only for today, `"Yesterday"`, short date within the current year, else a full date.
- `initialsOf` (lines 69–77, supporting): avatar-fallback initials, first letter of up to the first two whitespace-separated words.

## Insights

- `updateMessageInCache` and `updateConversationCache` are the ONLY two functions in this scope with direct knowledge of the cache shape — any future change to how conversations/messages are cached (e.g. adding a field, changing the messages array to a map) only needs to touch these two, not every call site.
- `formatMessageTime`/`formatConversationTime` both guard against an unparseable ISO string (`Number.isNaN(date.getTime())`) by returning `""` rather than throwing or rendering `"Invalid Date"`.

## Connections

Uses:
- `@levelup/hooks` (frontend/packages/hooks/src/index.ts): `queryKeys` (`.conversation`, `.unreadCount`).
- `@levelup/types` (frontend/packages/types/src/index.ts): `Conversation`, `Message`.
- `date-fns`: `format`, `isThisYear`, `isToday`, `isYesterday`.

Used by:
- `frontend/apps/mobile/src/features/messages/components/conversation-item.tsx` (in scope): `formatConversationTime`, `initialsOf`.
- `frontend/apps/mobile/src/features/messages/components/message-bubble.tsx` (in scope): `formatMessageTime`.

## Query pointers

If you need to change how the conversation/message cache is shaped or invalidated, read first: `updateConversationCache`/`updateMessageInCache` here, then every mutation elsewhere in `apps/mobile` that touches `queryKeys.conversation`/`queryKeys.unreadCount` (outside this scope). If you need to change timestamp formatting, also check `formatConversationTime`'s callers to confirm the today/yesterday/this-year boundaries still make sense for the new format.
