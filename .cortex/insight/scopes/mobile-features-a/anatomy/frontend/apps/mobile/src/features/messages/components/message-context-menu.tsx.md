---
path: frontend/apps/mobile/src/features/messages/components/message-context-menu.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 2
size_lines: 173
size_tokens: 1460
centrality: medium
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "584a88594b7df31337bd201011376e2085bdc76b48c686c9c1da61b702f5d464"
---

## Purpose

Floating long-press context menu anchored near the pressed message bubble: a quick-reactions row on top, then Edit/Delete (own messages only, via optional `onEdit`/`onDelete`) and Report below. Hand-rolled since no `@rn-primitives` popover/context-menu primitive is installed — reuses the same Portal + sibling-backdrop + rounded-card pattern as `alert-dialog.tsx`/`dialog.tsx`/`select.tsx`. Estimates its own height from the action-row count to decide whether to open above or below the press point, clamped to the screen edges on both axes.

## Connections

Uses:
- `@levelup/config` (frontend/packages/config/src/index.ts): `lightTheme`.
- `@rn-primitives/portal`: `Portal`.
- `react-native-reanimated`: `FadeIn`, `FadeOut`.
- `@/components/ui/text`, `@/lib/utils` (outside this scope): `cn`.

Used by:
- `frontend/apps/mobile/src/features/messages/components/message-bubble.tsx` (in scope): imports only the `ContextMenuAnchor` type, for its `onLongPressMenu` callback prop — the menu component itself is mounted by the parent conversation screen, not by `MessageBubble` directly.

Semantically related (not imports): `frontend/apps/mobile/src/features/messages/components/chat-more-options-menu.tsx` — same Portal/sibling-backdrop structure and the same VoiceOver/Maestro nesting gotcha, applied to a fixed anchor instead of a long-press point.
