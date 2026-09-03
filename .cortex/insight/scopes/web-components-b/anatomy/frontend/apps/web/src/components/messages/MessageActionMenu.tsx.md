---
path: frontend/apps/web/src/components/messages/MessageActionMenu.tsx
extracted_at: 2026-09-03T14:17:06Z
extraction_level: 2
size_lines: 117
size_tokens: 1116
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "c0113065ce4ecd99b7dc22dd83aa7d20cb15fdfb1818faa63618e18008d8e59d"
---

## Purpose

A framer-motion context-menu (long-press on touch, right-click on desktop) opened from `MessageBubble`, offering quick emoji reactions plus reply/edit/copy/delete/report/cancel actions (edit and delete only shown when the caller passes `onEdit`/`onDelete`, i.e. only for the viewer's own messages). Positions itself clamped to the viewport around the tap/click point, measuring the menu via `offsetWidth`/`offsetHeight` rather than `getBoundingClientRect()` — the rect would reflect the in-flight framer-motion `scale: 0.9` entrance transform and undermeasure the menu, clipping the last quick-reaction off-screen.

## Connections

Uses: `framer-motion` (`motion`, `AnimatePresence`); `lucide-react`; `@/lib/utils` (`cn`).

Used by: `frontend/apps/web/src/components/messages/MessageBubble.tsx` (in this scope), which supplies `isMine`, the open position, and all the callbacks.

Semantically related (not imports): `messages/ReportMessageDialog.tsx` — this menu's "Report" action is what `MessageBubble` uses to open that dialog for the specific message under the menu.
