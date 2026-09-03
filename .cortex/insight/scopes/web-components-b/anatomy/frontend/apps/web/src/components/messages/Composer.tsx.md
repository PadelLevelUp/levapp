---
path: frontend/apps/web/src/components/messages/Composer.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 114
size_tokens: 1044
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "45719408c58609c6762912db7efd54d852b83a626f3afd0eb24c10b2aba27e9e"
---

## Purpose

The message-input bar at the bottom of a chat thread: a single `MessageTextarea` plus a send button, doubling as the edit-in-place UI (pre-fills and refocuses when `editingMessage` is set) and showing a reply-preview strip above the input when `replyingTo` is set. On mobile it hides the bottom nav while the textarea is focused (via `useLayout().setBottomNavHidden`) so the on-screen keyboard doesn't fight the nav bar, and it disables sending with an explanatory note (`disabledNote`) when the other participant is blocked.

## Connections

Uses: `@/components/layout/LayoutContext` (`useLayout`, in this scope) for `setBottomNavHidden`; `@/components/ui/button`; `@/components/ui/message-textarea` (`MessageTextarea`); `@/types` (`Message`).

Used by: `frontend/apps/web/src/components/messages/ChatThread.tsx` (in this scope).

Semantically related (not imports): `messages/ChatThread.tsx` owns the `editingMessage`/`replyingTo` state this component renders — `Composer` itself is stateless with respect to which message is being edited/replied-to, only its own draft text.
