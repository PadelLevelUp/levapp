import { AT_BOTTOM_THRESHOLD_PX, isAtBottom, isNearTop } from "@levelup/hooks";

/**
 * The shape of a React Native scroll event's `nativeEvent`, narrowed to the
 * three measurements the thread's scroll rules need. Declared here rather than
 * imported from `react-native` so this module — and its test — stay outside the
 * native runtime (see frontend/CLAUDE.md on the mobile vitest environment).
 */
export type ScrollMetrics = {
  contentOffset: { y: number };
  layoutMeasurement: { height: number };
  contentSize: { height: number };
};

/**
 * PAD-208 / messaging.conversation-detail rule 10 — is the reader at the bottom?
 *
 * This is the whole fix on iOS, reduced to one predicate. The conversation list
 * used to call `scrollToEnd` from `onContentSizeChange` and `onLayout`
 * unconditionally, so every render batch, SSE arrival, reaction, refetch, image
 * load and keyboard open yanked the viewport back down while the user was
 * reading older messages (B-027). Now the list only follows content when this
 * says the reader was already at the bottom.
 *
 * The threshold and the arithmetic are `@levelup/hooks`' — shared with web, so
 * "at the bottom" cannot come to mean two different things on two shells. All
 * this adds is the mapping from React Native's event shape.
 */
export function isAtBottomOf(
  metrics: ScrollMetrics,
  threshold: number = AT_BOTTOM_THRESHOLD_PX
): boolean {
  return isAtBottom(
    {
      scrollOffset: metrics.contentOffset.y,
      viewportLength: metrics.layoutMeasurement.height,
      contentLength: metrics.contentSize.height,
    },
    threshold
  );
}

/**
 * PAD-208 / rule 11 — is the reader at the top of the loaded messages, where the
 * previous page should be fetched?
 */
export function isAtTopOf(
  metrics: ScrollMetrics,
  threshold: number = AT_BOTTOM_THRESHOLD_PX
): boolean {
  return isNearTop({ scrollOffset: metrics.contentOffset.y }, threshold);
}
