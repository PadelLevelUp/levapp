Three components in the mobile messages feature hand-roll a floating overlay menu — long-press message actions, "more options" on the chat header, and (structurally similar, though a full `Dialog`) the report reason picker — because no `@rn-primitives` popover/context-menu primitive is installed. `message-context-menu.tsx` and `chat-more-options-menu.tsx` share the exact recipe: `Portal` + a full-screen backdrop `Pressable` + an absolutely-positioned `Animated.View` card, entering/exiting with `FadeIn`/`FadeOut`. The backdrop and the menu card are always rendered as SIBLINGS inside the `Portal`, never parent/child — nesting the menu inside the backdrop `Pressable` collapses the whole subtree into a single iOS accessibility node, making the inner action buttons unreachable to VoiceOver and to Maestro-driven E2E (the same underlying constraint `sibling-pressables-not-nested` documents independently). Both components also independently clamp their position to the screen edges rather than relying on a layout primitive.

## Implemented by
`frontend/apps/mobile/src/features/messages/components/message-context-menu.tsx`
`frontend/apps/mobile/src/features/messages/components/chat-more-options-menu.tsx`
`frontend/apps/mobile/src/features/messages/components/report-message-dialog.tsx`

## Related concepts
[[sibling-pressables-not-nested]]
