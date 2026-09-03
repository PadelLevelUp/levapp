---
path: frontend/apps/web/src/pages/MessagesPage.tsx
extracted_at: 2026-09-03T14:15:37Z
extraction_level: 2
size_lines: 502
size_tokens: 4103
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "aab6c7629432ac24a6b3936707aad6a7098fde1454d4ec959941f6033f93d5ed"
---

## Purpose

The `/messages` and `/messages/:id` page: a two-pane (or mobile single-pane, toggled by `useIsMobile`) conversation list + chat thread, with the optional `:id` route param selecting which conversation is open (`mobileView` is `"thread"` when `id` is present, `"list"` otherwise). Loads a paginated conversation list (`getConversations`) with infinite-scroll-style `loadMoreConversations`, and drives real-time updates via a raw SSE connection (`createEventSource(token)` from `@/api/events`) rather than polling: `message_created` events promote a sender's own optimistic message from `"sent"` to `"delivered"`, append incoming messages from others, reorder the conversation list by most-recent activity, bump `unreadCount` (skipped if the conversation is currently open, via a ref-tracked `selectedConversationIdRef` to avoid stale-closure bugs in the SSE handler), and call `markConversationRead` for messages arriving in an already-open thread. Also owns send/edit/delete/react message actions and integrates `usePushNotifications` for the push-permission prompt flow.

## Connections

Uses: `@/api/events` (`createEventSource`, outside this scope), `@/api/messages` (`getConversations`, `getConversation`, `sendMessage`, `editMessage`, `deleteMessage`, `toggleReaction`, `createConversation`, `markConversationRead`, outside this scope), `@/auth/AuthContext` (`useAuth`, this scope), `@/components/layout/AppLayout`, `@/components/layout/LayoutContext` (`useLayout`, outside this scope), `@/components/messages/{ChatThread,ConversationList}` (outside this scope), `@/components/ui/{button,loading-skeleton}` (outside this scope), `@/hooks/{use-mobile,usePushNotifications}` (outside this scope), `@/types` (`Conversation`/`Message`, outside this scope), external `react`, `react-i18next`, `react-router-dom`.

Used by: `frontend/apps/web/src/App.tsx`, mounted at `/messages` and `/messages/:id`, both behind `ProtectedRoute`.
