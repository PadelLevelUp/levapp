---
path: frontend/apps/mobile/app/conversation/[id].tsx
extracted_at: 2026-09-03T14:11:46Z
extraction_level: 2
size_lines: 936
size_tokens: 8237
centrality: low
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "b34297425f5e6635e08dbcf1114d7ab8ba2a0ddff0591fb593082b30aa802d17"
---

## Purpose

The chat screen: single-conversation message thread with optimistic send, live SSE updates (created/edited/deleted/reaction), reply-to quoting with tap-to-scroll, long-press context menu (edit/delete/react/report, own-message-gated), block/unblock + report flows, and inline Yes/No response to `notification_invite` messages. Draws its own navy header (not the navigator's) to avoid iOS 26's translucent-glass back-button chrome clashing with the app's colors.

## Connections

Uses:
- `frontend/apps/mobile/src/auth/AuthContext.tsx`: `useAuth()` for `myId` (unresolved alias).
- `frontend/apps/mobile/src/lib/sse.ts`: `useAppEvents()` for live message create/edit/delete/reaction events (unresolved alias).
- `frontend/apps/mobile/src/hooks/useKeyboardVisible.ts`: drives the composer's bottom padding so it doesn't leave a gap above the keyboard or lose the home-indicator inset when the keyboard is down (unresolved alias).
- `@/features/messages/components/*` (`message-bubble`, `chat-more-options-menu`, `message-context-menu`, `report-message-dialog`), `@/features/messages/utils` (`invalidateMessagesLists`, `normalizeId`, `updateConversationCache`, `updateMessageInCache`): outside this scope (mobile-components) — these own the react-query cache-mutation helpers this screen calls throughout.
- `@levelup/api` (`messagesApi`, `notificationEngineApi`), `@levelup/config` (`lightTheme`), `@levelup/hooks` (`queryKeys`, `useConversation`), `@levelup/types` (`Message`): outside this scope (packages).

Used by: no file within this scope (routed via expo-router file convention).

## File map

Lines 1–61: imports, `ChatSkeleton` loading placeholder.
Lines 63–178: hook wiring — safe-area/keyboard-aware composer padding, route param → `conversationId`, `useConversation` fetch, all local UI state (draft, context menu, reply/edit targets, block state, report target, highlight-on-scroll), mark-conversation-read-once-per-open effect, and the blocked-users fetch + toggle-block handler.
Lines 180–270: `lastParticipantMessageId` memo (target for the header's Report action) and the SSE handler covering `message_created` / `message_edited` / `message_deleted` / `message_reaction`.
Lines 272–417: `handleSend` (optimistic temp-id message + SSE-aware reconciliation), edit-own-message flow, reaction toggling, reply flow, and `scrollToMessage` (tap-a-quoted-reply → scroll + 900ms highlight).
Lines 419–491: notification-invite Yes/No response handling (writes into the message's cached `metadata` rather than local state), delete-own-message flow.
Lines 492–605: render — custom navy header (name, role chip, more-options button) plus a headerless `Stack.Screen` (the actual navigation header is suppressed).
Lines 606–808: the `FlatList` message thread (natural oldest-first order + `scrollToEnd`-on-content-change instead of `inverted`, see Insights) and the composer / edit-composer, including the reply-preview strip and the blocked-conversation note.
Lines 810–935: overlays — `ChatMoreOptionsMenu`, block/unblock confirmation, `ReportMessageDialog`, `MessageContextMenu`, and the delete-message confirmation.

## Insights

- The message list is deliberately NOT an `inverted` `FlatList`. A comment explains that on the New Architecture (Fabric), `inverted` lists (which RN implements via a `scaleY(-1)` transform) report wrong accessibility frames and break hit-testing on iOS — bubbles become untappable for VoiceOver and for UI automation. The list instead keeps natural oldest-first order and calls `scrollToEnd(animated:false)` on `onContentSizeChange`/`onLayout` to stay pinned to the bottom.
- `headerShown: false` plus a hand-drawn header `View` is a deliberate iOS-26-specific workaround: the platform renders `UIBarButtonItem`s inside a translucent "glass capsule" (the grey pill behind back/options controls) that clashes with the app's navy/colour system — not a stylistic preference.
- `keyboardVerticalOffset={0}` on `KeyboardAvoidingView` is load-bearing, not a default: because this screen draws its own header instead of using the navigator's, the avoiding view already starts below it; RN ADDS the offset to the avoided height, so any nonzero value (the previous value, 90, predates the custom header) reopens a gap between the composer and the keyboard (PAD-145).
- Notification-invite responses are written into `message.metadata` via `updateMessageInCache` rather than kept as ephemeral local state — unlike web's `MessageBubble.tsx`, which keeps a `localResponse` — so `MessageBubble` here renders purely off cached message data with no response state of its own.
- The optimistic-send temp message (`id: "temp-${Date.now()}"`) is reconciled against a possible SSE-delivered duplicate: `handleSend`'s success path checks whether the SSE `message_created` handler already delivered the same server id before overwriting vs. dropping the temp entry.

## Query pointers

If you're chasing a message that won't respond to a tap/long-press, check `isTempId()` first — bubbles for still-sending optimistic messages are explicitly non-interactive (no context menu, no reaction, no invite-respond) until a real server id replaces them.
If you need to add a new SSE-driven message mutation, add a branch to the `useAppEvents` handler (lines ~194–270) using the same `updateMessageInCache`/`updateConversationCache` helpers from `@/features/messages/utils` that every existing branch uses, to keep cache writes consistent.
