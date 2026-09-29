/**
 * Whether the conversation thread follows the newest message — messaging.conversation-detail
 * rule 10 ("content grows while the reader is at the bottom: stay pinned"), and how a
 * programmatic landing (rule 9a's first unread, rule 12's push target) is protected from it.
 *
 * B-189 (PAD-415, proven on the simulator, flow 114 run 9): the walk issued an animated
 * `scrollToIndex` to the first unread; a scroll frame at the bottom — the offset adjustment
 * right after the older page was prepended, before the animation moved — flipped "at bottom"
 * back on, and the next content-size change took rule 10's branch and `scrollToEnd`ed,
 * cancelling the landing. So a landing SUSPENDS following: while suspended, no scroll frame
 * can put the reader "at the bottom" and no content growth re-pins, a new message included.
 * The reader's own action ends it — a drag, or sending / jumping to the latest (which also
 * lands at the newest).
 *
 * Pure, so the rule is testable without mounting the screen; the screen dispatches the events
 * it already receives and executes the effect.
 */
export type FollowState = {
  /** The reader is at the newest message, so growth keeps the thread pinned (rule 10). */
  atBottom: boolean;
  /** A programmatic landing is in charge of the viewport until the reader acts. */
  suspended: boolean;
};

export type FollowEvent =
  /** A different thread opens. */
  | { type: "reset" }
  /** The screen issued a programmatic scroll to a target (rule 9a / rule 12). */
  | { type: "landing" }
  /** A scroll frame, with whether it reports the bottom. */
  | { type: "scroll"; atBottom: boolean }
  /** The reader started dragging the list. */
  | { type: "drag" }
  /** The reader sent a message or jumped to the latest: the thread goes to the newest. */
  | { type: "toLatest" }
  /** The content grew (a new message, rows committing) after the reveal. */
  | { type: "contentGrew" };

export type FollowEffect = "scrollToEnd" | null;

export function initialFollowState(): FollowState {
  return { atBottom: true, suspended: false };
}

export function followReducer(state: FollowState, event: FollowEvent): { state: FollowState; effect: FollowEffect } {
  switch (event.type) {
    case "reset":
      return { state: initialFollowState(), effect: null };
    case "landing":
      return { state: { atBottom: false, suspended: true }, effect: null };
    case "scroll":
      // While a landing is in charge, a frame at the bottom is the list settling, not the reader.
      return { state: state.suspended ? state : { ...state, atBottom: event.atBottom }, effect: null };
    case "drag":
      return { state: { ...state, suspended: false }, effect: null };
    case "toLatest":
      return { state: { atBottom: true, suspended: false }, effect: null };
    case "contentGrew":
      return { state, effect: state.atBottom && !state.suspended ? "scrollToEnd" : null };
    default:
      return { state, effect: null };
  }
}
