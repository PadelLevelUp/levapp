---
path: frontend/apps/mobile/src/features/messages/components/message-bubble.tsx
extracted_at: 2026-09-03T14:12:16Z
extraction_level: 3
size_lines: 430
size_tokens: 3809
centrality: high
built_at_commit: "55cbb68fa2a12a87cf20a7025f6e94b9681f8226"
source_sha256: "e660423df3a6ff4d6e940c3628b257d5ddf71d0c49298a1a06c085c16b18a140"
---

## Purpose

Chat bubble: own messages right-aligned/brand-coloured, others left-aligned/muted. Handles the full steady-state message surface — text, reply-quote preview, timestamp, per-status delivery icon, reactions, and (for `notification_invite` messages) an inline Yes/No response or a resolved status pill — plus two gestures: long-press opens the context menu, and a right-swipe past a threshold enters reply mode. Direct RN port of `apps/web/src/components/messages/MessageBubble.tsx`.

## Main players

- `withAlpha` (lines 28–31, supporting): LOCAL helper appending a CSS Color 4 alpha to an `hsl(h s% l%)` token string. Same name, DIFFERENT implementation from `@levelup/config`'s `withAlpha` used elsewhere in this scope (e.g. `ClassFillBar.tsx`) — don't assume they're interchangeable.
- `StatusIcon` (lines 34–75, supporting): maps a `MessageStatus` (`sending`/`sent`/`delivered`/`read`/`failed`) to an `Ionicons` glyph + colour; mirrors web's `MessageBubble.tsx` `StatusIcon` exactly, including two one-off hardcoded hex colours (`READ_ICON_COLOR`, `ACCEPTED_ICON_COLOR`) that intentionally sit outside the `@levelup/config` design tokens.
- `MessageBubble` (lines 112–429, critical): the sole default export. Composes a pan gesture (swipe-to-reply) with a long-press gesture via `Gesture.Race`, renders the bubble body, reply-quote block, reaction pills, and the `notification_invite` response area driven off `message.metadata`.

## Insights

- The gesture-composed swipe-to-reply is tuned by two constants: `REPLY_TRIGGER_DISTANCE = 60` (release past this to fire `onReply`) and `REPLY_MAX_DRAG = 80` (visual drag ceiling, independent of the trigger distance) — changing one without the other changes how "committed" the gesture feels before it fires.
- The outer `Animated.View` deliberately carries NO `accessible`/`accessibilityLabel` prop: labeling the container would collapse every child (reaction pills, Yes/No respond buttons) into a single iOS accessibility node, hiding them from VoiceOver and from Maestro-driven E2E. The message text is read natively as a visible `Text` child instead.
- The `notification_invite` Yes/No response is rendered straight off `message.metadata.responded`/`.response` — there is no local component state for it. The response is written into the cache by the caller (`conversation/[id].tsx`'s `handleRespondToInvite`, outside this scope) elsewhere, so this component just renders whatever the steady-state field says, like any other field.
- `isDeleted` short-circuits to a minimal muted "message deleted" bubble before any gesture/reaction/invite logic runs — a deleted message never carries interactive affordances.

## Connections

Uses:
- `frontend/apps/mobile/src/features/messages/utils.ts` (in scope): `formatMessageTime`.
- `frontend/apps/mobile/src/features/messages/components/message-context-menu.tsx` (in scope): `ContextMenuAnchor` type only (for the `onLongPressMenu` callback signature) — the menu itself is rendered by the parent screen, not by `MessageBubble`.
- `@levelup/config` (frontend/packages/config/src/index.ts): `lightTheme`.
- `@levelup/types` (frontend/packages/types/src/index.ts): `Message`, `MessageStatus`.
- `react-native-gesture-handler`, `react-native-reanimated`: `Gesture`/`GestureDetector`, `useSharedValue`/`useAnimatedStyle`/`withSpring`/`interpolate`/`runOnJS`.
- `@/components/ui/text`, `@/lib/utils` (outside this scope): `cn`.

Used by: none within this scope — rendered inside the conversation screen's message list outside this slice.

## Query pointers

If you need to change reaction or invite-response UI, also read: `apps/web/src/components/messages/MessageBubble.tsx` (explicitly mirrored — keep both in sync). If you need to change the long-press menu contents, read first: `message-context-menu.tsx` (the `ContextMenuAnchor` contract), then the parent conversation screen that actually mounts the menu.
