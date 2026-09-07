import { AT_BOTTOM_THRESHOLD_PX } from "@levelup/hooks";

/**
 * The conversation thread's reveal gate — messaging.conversation-detail rule 9.
 *
 * PAD-208 positioned the list with a single `scrollToEnd` on its first
 * content-size change and left it visible throughout. That satisfied the letter
 * of rule 9 (no animation, no travel per batch) and still showed the user older
 * messages flying past, because a `FlatList` on Fabric commits rows
 * incrementally: every intermediate layout is a frame somebody watches (B-028).
 *
 * So the list is now hidden until it is anchored, and this reducer decides when
 * that is. It is a pure function over events the screen already receives, which
 * is the point: rule 9 says the reveal must be driven by an **observed**
 * end-of-content state rather than by a delay. A "wait 200ms and hope" would
 * pass every test written for it and still fail on a slower phone with a longer
 * thread — which is exactly how the `initialNumToRender` assumption got shipped.
 *
 * What counts as anchored is **the offset**, not the content height. An earlier
 * version of this reducer also revealed when a content-size change repeated the
 * same height — "the list stopped growing" — and a simulator recording of a
 * 200-message thread showed why that is wrong: the thread opened on messages
 * 171-182 of 200. The height had settled, `scrollToEnd` had been issued, and
 * the offset had simply not moved (`maintainVisibleContentPosition` holds the
 * top cell in place while rows commit, which is exactly what it is for). Height
 * stability proves the content stopped changing; it says nothing about where
 * the viewport is. So:
 *
 *   1. Every content-size change while positioning re-issues `scrollToEnd` —
 *      the list grew, aim at the end again.
 *   2. A scroll frame reporting the offset **at the end** reveals. That is the
 *      only positive observation, and it is the one the rule actually asks for.
 *   3. Content that fits inside the viewport reveals immediately: there is no
 *      scrolling to do, and no scroll event will ever arrive to say so.
 *
 * Plus one escape hatch: `fallback`, a short bounded timer on the screen. A
 * measurement that never settles must reveal a possibly-imperfect thread rather
 * than leave a permanently blank one.
 *
 * This lives in the mobile shell rather than in `@levelup/hooks` because there
 * is nothing to share: the web list anchors inside a `useLayoutEffect`, between
 * React writing the DOM and the browser painting it, so it has no unanchored
 * frame to hide. The problem is specific to the native list's commit model.
 * `scroll-position.ts` next door draws the same line.
 */

export type AnchorPhase =
  /** No data yet. The thread area shows the placeholder. */
  | "idle"
  /** Data has arrived and the list is being positioned, still hidden. */
  | "positioning"
  /** Anchored at the newest message and visible. */
  | "anchored";

export type AnchorState = {
  phase: AnchorPhase;
  /** True once a `scrollToEnd` has been issued for this thread. */
  positionRequested: boolean;
  /** The list's own height, from `onLayout`. Null until it has laid out. */
  viewportHeight: number | null;
};

export type AnchorEvent =
  /** The conversation changed — start over, hidden. */
  | { type: "reset" }
  /** The first page arrived. */
  | { type: "data"; messageCount: number }
  /** `onLayout` — how tall the list itself is. */
  | { type: "layout"; viewportHeight: number }
  /** `onContentSizeChange`. */
  | { type: "contentSize"; height: number }
  /** `onScroll`, reduced to the one number that matters. */
  | { type: "scroll"; distanceFromBottom: number }
  /** The bounded escape hatch — reveal regardless. */
  | { type: "fallback" };

/**
 * What the screen must do as a result. `null` is by far the common case: this
 * reducer is mostly deciding *not* to act.
 */
export type AnchorEffect = "scrollToEnd" | "reveal" | null;

/**
 * How close to the end counts as "the position took effect" — the same
 * threshold rule 10 uses for "at the bottom", so the feature has one definition
 * of that and not two.
 *
 * It is not a sub-pixel epsilon, and a device trace is why: after a successful
 * `scrollToEnd` the list reported 13.99px from the end, which is the content
 * container's own bottom padding. A 1px epsilon rejected that, no other frame
 * ever came, and the reveal fell through to the fallback with the thread
 * correctly positioned but the gate none the wiser.
 */
const AT_END_EPSILON_PX = AT_BOTTOM_THRESHOLD_PX;

export function initialAnchorState(): AnchorState {
  return { phase: "idle", positionRequested: false, viewportHeight: null };
}

const ANCHORED: AnchorState = {
  phase: "anchored",
  positionRequested: true,
  viewportHeight: null,
};

export function anchorReducer(
  state: AnchorState,
  event: AnchorEvent
): { state: AnchorState; effect: AnchorEffect } {
  if (event.type === "reset") {
    return { state: initialAnchorState(), effect: null };
  }

  // The gate is one-way: once the thread is visible, nothing may hide it again.
  // A later page, a new message or the keyboard must not blank the screen.
  if (state.phase === "anchored") {
    return { state, effect: null };
  }

  if (event.type === "fallback") {
    return { state: ANCHORED, effect: "reveal" };
  }

  // The list's own height is worth recording whatever phase we are in.
  if (event.type === "layout") {
    return {
      state: { ...state, viewportHeight: event.viewportHeight },
      effect: null,
    };
  }

  if (event.type === "data") {
    if (state.phase !== "idle") return { state, effect: null };
    // An empty thread has nothing to anchor to and no rows to commit — hiding
    // it would only mean showing a placeholder in front of a placeholder.
    if (event.messageCount === 0) {
      return { state: { ...ANCHORED, viewportHeight: state.viewportHeight }, effect: "reveal" };
    }
    return {
      state: { ...state, phase: "positioning", positionRequested: false },
      effect: null,
    };
  }

  // Content with a real height IS the list having something to anchor, whether
  // or not the `data` effect has run yet. The two arrive from different worlds
  // — one a React effect, one a native callback — and ordering between them is
  // not guaranteed; dropping a content-size change for arriving first would
  // strand the gate until the fallback.
  if (state.phase === "idle" && event.type === "contentSize" && event.height > 0) {
    state = { ...state, phase: "positioning" };
  }

  if (state.phase !== "positioning") {
    return { state, effect: null };
  }

  if (event.type === "contentSize") {
    // A zero height is the list before it has laid anything out. Aiming at the
    // end of nothing would be a no-op that then looks like a completed attempt.
    if (event.height <= 0) return { state, effect: null };

    // Nothing to scroll: the whole thread fits on screen, so it is already
    // showing its newest message. No scroll event will ever arrive to say so,
    // and waiting for one would mean sitting behind the placeholder until the
    // fallback fires — for a two-message conversation.
    if (state.viewportHeight !== null && event.height <= state.viewportHeight) {
      return { state: { ...ANCHORED, viewportHeight: state.viewportHeight }, effect: "reveal" };
    }

    // It grew. Aim at the end again — and keep doing so on every growth, since
    // each committed batch pushes the end further down.
    return {
      state: { ...state, positionRequested: true },
      effect: "scrollToEnd",
    };
  }

  // The one positive observation: a frame confirms the offset is at the end.
  // Only meaningful after a scroll has been issued — a list that has never been
  // positioned reports offset 0, which on a short thread is also "the end", and
  // would reveal before anything had been aimed anywhere.
  if (!state.positionRequested) return { state, effect: null };
  if (event.distanceFromBottom <= AT_END_EPSILON_PX) {
    return { state: { ...ANCHORED, viewportHeight: state.viewportHeight }, effect: "reveal" };
  }

  return { state, effect: null };
}
