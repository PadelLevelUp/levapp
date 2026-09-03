# concept:floating-portal-menu

Three components in the messages feature hand-roll a floating overlay menu —
long-press message actions, "more options" on the chat header, and (by pattern
similarity, though it's a full `Dialog`) the report reason picker — because no
`@rn-primitives` popover/context-menu primitive is installed in this app.
`message-context-menu.tsx` and `chat-more-options-menu.tsx` share the exact
same structural recipe: `Portal` + a full-screen backdrop `Pressable` + an
absolutely-positioned `Animated.View` card, entering/exiting with
`FadeIn`/`FadeOut`. The backdrop and the menu card are always rendered as
SIBLINGS inside the `Portal`, never as parent/child — nesting the menu inside
the backdrop `Pressable` collapses the whole subtree into a single iOS
accessibility node, making the inner action buttons unreachable to VoiceOver
and to Maestro-driven E2E. Both components also independently clamp their
position to the screen edges (`EDGE_MARGIN`) rather than relying on any layout
primitive to do it for them.

Members: `frontend/apps/mobile/src/features/messages/components/message-context-menu.tsx`,
`frontend/apps/mobile/src/features/messages/components/chat-more-options-menu.tsx`.

Related but structurally different: `frontend/apps/mobile/src/features/messages/components/report-message-dialog.tsx`
uses a real `Dialog` (not a hand-rolled Portal) but shares the same
"no primitive installed, roll a plain Pressable list with a hand-drawn radio
dot" fallback pattern for its reason picker.
