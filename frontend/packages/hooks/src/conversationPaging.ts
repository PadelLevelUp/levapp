import type { Conversation, Message } from "@levelup/types";

/**
 * Conversation thread paging — the platform-neutral half.
 *
 * PAD-208 / messaging.conversation-detail rules 1, 10 and 11. Both shells hold
 * the thread as one ascending array of messages: web in `MessagesPage` state,
 * iOS in the react-query cache under `queryKeys.conversation(id)`. What differs
 * between them is only how the viewport is held still while the array changes —
 * `scrollTop` compensation on the web, `maintainVisibleContentPosition` on the
 * native list. The merge itself is the same on both, so it lives here, is pure,
 * and is tested once.
 */

/**
 * How many messages a page carries when walking back through the history.
 */
export const CONVERSATION_PAGE_SIZE = 50;

/**
 * How many messages the thread OPENS with (PAD-224 / rule 9).
 *
 * Smaller than a walk-back page on purpose. The native list commits rows
 * incrementally, so the number of rows in the first page is the length of the
 * interval during which the thread is not yet anchored and therefore not yet
 * shown — 30 is a comfortable two-plus screens of context that settles almost
 * at once, where 50 measurably did not (B-028). Reading further back is a
 * deliberate act by then, so those pages stay at `CONVERSATION_PAGE_SIZE`.
 */
export const CONVERSATION_FIRST_PAGE_SIZE = 30;

/**
 * How close to the bottom counts as "at the bottom" (rule 10). Roughly one
 * bubble: close enough that a new message arriving keeps the reader's place,
 * far enough that a deliberate scroll up is respected.
 */
export const AT_BOTTOM_THRESHOLD_PX = 100;

/**
 * True when the viewport is at (or within a bubble of) the bottom of the thread.
 * Rule 10 hangs off this: at the bottom, an incoming message keeps the view
 * pinned there; away from it, nothing may move the viewport at all.
 */
export function isAtBottom(
  metrics: { scrollOffset: number; viewportLength: number; contentLength: number },
  threshold: number = AT_BOTTOM_THRESHOLD_PX
): boolean {
  const distanceFromBottom =
    metrics.contentLength - metrics.scrollOffset - metrics.viewportLength;
  return distanceFromBottom < threshold;
}

/** True when the viewport is at (or within `threshold` of) the top of the thread. */
export function isNearTop(
  metrics: { scrollOffset: number },
  threshold: number = AT_BOTTOM_THRESHOLD_PX
): boolean {
  return metrics.scrollOffset <= threshold;
}

/**
 * Whether the jump-to-bottom control is shown (PAD-224 / rule 12).
 *
 * Two reasons, one control. The reader is more than a screen above the bottom —
 * far enough that scrolling back by hand is a chore — or messages have arrived
 * that they have not seen (rule 10's affordance, folded in here so the two never
 * render as two competing buttons). Either way it disappears at the bottom.
 *
 * The distance is measured in viewports rather than pixels because "a long way
 * back" means something different on a phone and on a desktop pane, and a fixed
 * pixel budget would be one or the other.
 */
export function shouldShowJumpToBottom(state: {
  distanceFromBottom: number;
  viewportHeight: number;
  hasUnseen: boolean;
}): boolean {
  const atBottom = state.distanceFromBottom < AT_BOTTOM_THRESHOLD_PX;
  if (atBottom) return false;
  if (state.hasUnseen) return true;
  return state.distanceFromBottom > state.viewportHeight;
}

/**
 * Whether another page should be requested right now (rule 11): only near the
 * top, only when the server said there is more, and only one page at a time —
 * a fast flick to the top fires several scroll events and must not fire several
 * requests.
 */
export function shouldLoadOlder(state: {
  nearTop: boolean;
  hasMore: boolean | undefined;
  isLoadingOlder: boolean;
}): boolean {
  return state.nearTop && state.hasMore === true && !state.isLoadingOlder;
}

/**
 * Prepend an older page onto the loaded thread (rule 11).
 *
 * The server's `before` is exclusive, so an overlap should not happen — but SSE
 * can append a message that a concurrent page fetch also returns, so the merge
 * de-duplicates by id anyway rather than trusting the cursor. Ids are compared
 * as strings because the optimistic send writes a `temp-…` id alongside the
 * server's numeric ones.
 *
 * `hasMore` and `oldestMessageId` come from the page that was just fetched: it
 * is the one that knows what lies behind it.
 */
export function mergeOlderPage(
  current: Conversation,
  olderPage: Pick<Conversation, "messages" | "hasMore">
): Conversation {
  const known = new Set(current.messages.map((m) => String(m.id)));
  const fresh = olderPage.messages.filter((m) => !known.has(String(m.id)));
  const messages = [...fresh, ...current.messages];

  return {
    ...current,
    messages,
    hasMore: olderPage.hasMore ?? false,
    oldestMessageId: messages.length ? messages[0].id : null,
  };
}

/**
 * Apply an incoming `message_created` to the loaded thread.
 *
 * Rule 10's "append to the newest page only": the newest page is the tail of the
 * array, so an arrival is appended there and never disturbs the older pages
 * above it. A message already present is the sender's own — the optimistic row
 * was replaced by the saved one before SSE echoed it back — and is promoted to
 * `delivered` in place rather than duplicated.
 */
export function applyIncomingMessage(
  current: Conversation,
  message: Message
): Conversation {
  const exists = current.messages.some(
    (m) => String(m.id) === String(message.id)
  );

  if (exists) {
    return {
      ...current,
      messages: current.messages.map((m) =>
        String(m.id) === String(message.id)
          ? { ...m, status: "delivered" as const }
          : m
      ),
    };
  }

  return {
    ...current,
    messages: [...current.messages, { ...message, status: "delivered" as const }],
  };
}
