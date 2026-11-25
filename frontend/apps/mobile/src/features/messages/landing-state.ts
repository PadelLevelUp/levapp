/**
 * Whether a programmatic landing (the first unread, a push or deep-link target) has arrived —
 * messaging.conversation-detail rule 9c, B-732 / B-733.
 *
 * The screen used to issue one scroll to the target and forget it. On Android that scroll can be
 * undone by the list's own correction when the older page mounts, and the thread stayed at the
 * newest message. So the landing stays open until the list settles with its row on screen: settled
 * without it, the scroll is issued again, a bounded number of times.
 *
 * Pure, like follow-state.ts next door; the screen dispatches the events and runs the effect.
 */

/** Scrolls issued again after the first one, at most. */
export const LANDING_MAX_REPEATS = 5;
/** How long the list must be quiet (no scroll frame, no size change) to count as settled. */
export const LANDING_SETTLE_MS = 250;

export type LandingState = { messageId: string; repeatsLeft: number } | null;

export type LandingEvent =
  /** The screen issued the landing scroll to this message. */
  | { type: "land"; messageId: string | number }
  /** The list has been quiet for LANDING_SETTLE_MS, with these rows on screen. */
  | { type: "settled"; visibleIds: readonly (string | number)[] }
  /** The reader dragged, sent or jumped to the latest; another thread opened; or the row is gone. */
  | { type: "end" };

/**
 * The end of the thread as a landing's target (rule 10, B-731): the user's own sent message. Its row
 * has a temporary id, so the list being at its end stands for it. The screen lists it in
 * `visibleIds` when `isAtEnd` says so.
 */
export const LANDING_LATEST = "latest";

/**
 * How far from the end still counts as there: the content's bottom padding (about 14 px, which
 * `scrollToEnd` leaves out) and some slack, well under a bubble.
 */
const AT_END_PX = 24;

export function isAtEnd(contentHeight: number, offset: number, viewportHeight: number): boolean {
  return contentHeight - offset - viewportHeight <= AT_END_PX;
}

/** The message to scroll to again, or null. */
export type LandingEffect = { scrollTo: string } | null;

export function landingReducer(
  state: LandingState,
  event: LandingEvent
): { state: LandingState; effect: LandingEffect } {
  switch (event.type) {
    case "land":
      return { state: { messageId: String(event.messageId), repeatsLeft: LANDING_MAX_REPEATS }, effect: null };
    case "settled": {
      if (state === null) return { state, effect: null };
      const arrived = event.visibleIds.some((id) => String(id) === state.messageId);
      if (arrived || state.repeatsLeft === 0) return { state: null, effect: null };
      return {
        state: { ...state, repeatsLeft: state.repeatsLeft - 1 },
        effect: { scrollTo: state.messageId },
      };
    }
    case "end":
      return { state: null, effect: null };
  }
}
