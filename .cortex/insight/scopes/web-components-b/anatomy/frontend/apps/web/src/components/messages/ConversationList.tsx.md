---
path: frontend/apps/web/src/components/messages/ConversationList.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 149
size_tokens: 1501
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "07bf7288a4cab0a8676e58445ed5fcbb537782432ea566fe81073f91aff5a817"
---

## Purpose

The left-hand conversation list in the messages page: a search box, a "new conversation" trigger, and a scrollable, client-side-filtered list of conversations with avatar, name, last-message preview, timestamp, and unread-count pill. Infinite-scrolls via an `IntersectionObserver` on a sentinel div that calls `onLoadMore` when it enters view. Selected rows get a 3px primary-coloured left border rather than relying on background colour alone — plain `bg-secondary` measured only 1.03:1 contrast against the panel background (a hue shift with no luminance step), so the border carries the selection signal independent of whether the fill is distinguishable.

## Connections

Uses: `./NewConversationDialog` (in this scope); `@/components/ui/input`, `@/components/ui/avatar`, `@/components/ui/scroll-area`; `@/lib/utils` (`cn`); `@/lib/conversationTime` (`formatConversationTimestamp`, outside this scope); `@/types` (`Conversation`).

Used by: not referenced by any other file in this scope's `files[]` — likely mounted directly by the messages page (outside this scope).

Semantically related (not imports): none beyond the direct import of `NewConversationDialog.tsx`.
