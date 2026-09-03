---
path: frontend/apps/web/src/components/messages/NewConversationDialog.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 154
size_tokens: 1199
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "2ac334a7b010874d48759ad9b1f95ab9b07079c976c9c31026377f222fc72fb0"
---

## Purpose

A dialog, triggered by a pencil-icon button next to the conversation search box, listing messageable users the coach/player doesn't already have a conversation with (filtered client-side by `existingParticipantIds`) so they can start a new one. Fetches the full messageable-user list from `getMessageableUsers` fresh every time the dialog opens.

## Connections

Uses: `@/api/users` (`getMessageableUsers`, outside this scope); `@/components/ui/dialog`, `@/components/ui/button`, `@/components/ui/input`, `@/components/ui/avatar`, `@/components/ui/scroll-area`; `@/lib/utils` (`cn`).

Used by: `frontend/apps/web/src/components/messages/ConversationList.tsx` (in this scope), which supplies `existingParticipantIds` and handles the actual conversation creation via `onSelectUser`.

Semantically related (not imports): none beyond its direct parent, `ConversationList.tsx`.
