---
path: frontend/apps/web/src/components/messages/ChatThread.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 3
size_lines: 150
size_tokens: 1163
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e4bf0239bca74f34e1a3fe5f864057403952ba937f1ecf2c53ff0c4943d0b4ab"
---

## Purpose

The single active conversation panel: composes `ChatHeader` + `MessageList` + (conditionally) `Composer` + `ReportMessageDialog` into one thread view, and owns the state that spans all of them — which message is being edited or replied to, the coach/player's blocked-user set (fetched fresh whenever the open conversation's participant changes), and whether the header-level report dialog is open. Assistant conversations (`conversation.isAssistant`) render without a `Composer` at all — they're a one-way channel.

## Main players

- `ChatThread` (function component, lines 22–149) — critical, the file's only export. Composes the whole thread view and owns cross-child state.
- `handleConfirmToggleBlock` (lines 64–82, local to `ChatThread`) — critical. Calls `blockUser`/`unblockUser` from `@/api/messages`, optimistically updates the local `blockedUserIds` set, and toasts success/failure.
- `lastParticipantMessageId` (`useMemo`, lines 54–62) — critical. Scans `conversation.messages` backwards for the most recent message NOT sent by the current user; this is what the header's "Report" action reports (see Insights).

## Insights

- `ReportMessageDialog` is mounted from TWO places that both live in this scope: here (reporting `lastParticipantMessageId`, i.e. "report the most recent thing they sent me", triggered from `ChatHeader`'s dropdown) and separately inside every `MessageBubble` (reporting that specific bubble's own message, triggered from `MessageActionMenu`'s per-message "Report" action). They are independent dialog instances with independent `open` state — the component is deliberately built to be reusable this way (see its own doc comment).
- The blocked-users list is refetched via `getBlockedUsers()` on every `participantId` change rather than being lifted to a shared cache — each open conversation re-derives its own `isBlocked` flag from scratch.
- `handleSend` fires `onSendMessage` without awaiting it (`void onSendMessage(...)`) and clears `replyingTo` immediately/optimistically, rather than waiting for the send to resolve — a failed send does not restore the reply-preview state.

## Connections

Uses: `./ChatHeader`, `./Composer`, `./MessageList`, `./ReportMessageDialog` (all in this scope); `@/api/messages` (`blockUser`, `unblockUser`, `getBlockedUsers`, outside this scope); `@/types` (`Conversation`, `Message`); `sonner` (`toast`).

Used by: not referenced by any other file in this scope's `files[]` — mounted directly by the messages page (outside this scope), which supplies the active `conversation` and the send/edit/delete/reaction callbacks (presumably backed by `@/api/messages` and/or an SSE stream).

Semantically related (not imports): `layout/AppLayout.tsx`'s SSE listener for `message_created` explicitly avoids racing "MessagesPage marks it read first then calls refreshUnreadCount" — i.e. whichever page hosts `ChatThread` is expected to mark-as-read and refresh the unread badge itself; `ChatThread` has no read-receipt logic of its own.

## Query pointers

If you need to change what "Report" reports from the chat header vs. from a specific bubble, this file (`lastParticipantMessageId`) is the header path; `MessageBubble.tsx` is the per-message path — they are independent, so a fix to one does not touch the other.
If you need to change block/unblock behavior, read this file's `handleConfirmToggleBlock` first, then `ChatHeader.tsx` for the confirmation dialog UI that triggers it.
