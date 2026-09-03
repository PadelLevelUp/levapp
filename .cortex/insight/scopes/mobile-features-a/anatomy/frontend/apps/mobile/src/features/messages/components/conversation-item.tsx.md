---
path: frontend/apps/mobile/src/features/messages/components/conversation-item.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 84
size_tokens: 636
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "88af434a521b75be854254e0ac290f14957d8639401231d89afcd4e4b09491f4"
---

## Purpose

Single row of the conversation list: avatar (with initials fallback), participant name, role badge, last-message preview (or an empty-state string), a relative/short timestamp, and an unread-count badge when `unreadCount > 0`.

## Connections

Uses:
- `frontend/apps/mobile/src/features/messages/utils.ts` (in scope): `formatConversationTime`, `initialsOf`.
- `@levelup/types` (frontend/packages/types/src/index.ts): `Conversation`.
- `@/components/ui/{avatar,badge,text}` (outside this scope).

Used by: none within this scope — rendered in the conversation-list screen's `FlatList` outside this slice.
