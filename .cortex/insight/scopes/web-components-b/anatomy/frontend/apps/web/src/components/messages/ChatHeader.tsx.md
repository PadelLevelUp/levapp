---
path: frontend/apps/web/src/components/messages/ChatHeader.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 152
size_tokens: 1409
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "20207e0986188003a3b43b02384b43f57513bff5f24e77b50bc35deab375052a"
---

## Purpose

The chat thread's header bar: participant avatar/name/role, a mobile-only back button (`showBack`), and — unless the conversation `isAssistant` (a real user isn't behind assistant conversations, so there's nothing to block or report) — a dropdown with block/unblock and report actions. Block/unblock goes through a confirmation `AlertDialog` before calling `onConfirmToggleBlock`; report just calls `onReport`, leaving the actual dialog to the parent (`ChatThread`).

## Connections

Uses: `@/components/ui/avatar`, `@/components/ui/button`, `@/components/ui/dropdown-menu`, `@/components/ui/alert-dialog`; `@/types` (`Conversation`); `i18next` (`TFunction` type only).

Used by: `frontend/apps/web/src/components/messages/ChatThread.tsx` (in this scope), which owns the block-state and passes `isBlocked`/`onConfirmToggleBlock`/`onReport` down.

Semantically related (not imports): `messages/ReportMessageDialog.tsx` — this header's "Report" menu item is one of the two mount points that open that dialog (via `ChatThread`, using the conversation's most recent message from the other participant); the other is `MessageBubble.tsx`'s per-message action menu.
