import { describe, expect, it } from "vitest";

import {
  anchorReducer,
  initialAnchorState,
  type AnchorEvent,
  type AnchorState,
} from "./anchor-state";

/**
 * PAD-224 / B-028 — the reveal gate for the conversation thread
 * (messaging.conversation-detail rule 9).
 *
 * Rule 9 now says the list is not *shown* until it is anchored, and that the
 * reveal is driven by an observed end-of-content state rather than by a delay.
 * "Observed" is what makes this testable at all: the whole machine is a pure
 * reducer over events the screen already receives — data arriving, content-size
 * changes, scroll offsets — plus one bounded fallback. A timing heuristic would
 * pass here and still fail on a phone, which is exactly what happened to the
 * `initialNumToRender` assumption PAD-208 shipped.
 */

/** Drive the reducer through a list of events, returning the effects in order. */
function run(events: AnchorEvent[], from: AnchorState = initialAnchorState()) {
  const effects: (string | null)[] = [];
  let state = from;
  for (const event of events) {
    const next = anchorReducer(state, event);
    state = next.state;
    effects.push(next.effect);
  }
  return { state, effects };
}

const data = (messageCount = 30): AnchorEvent => ({ type: "data", messageCount });
const size = (height: number): AnchorEvent => ({ type: "contentSize", height });
const scrolled = (distanceFromBottom: number): AnchorEvent => ({
  type: "scroll",
  distanceFromBottom,
});
const fallback: AnchorEvent = { type: "fallback" };
const reset: AnchorEvent = { type: "reset" };
const layout = (viewportHeight = 600): AnchorEvent => ({
  type: "layout",
  viewportHeight,
});

describe("the thread starts hidden", () => {
  it("is not anchored before any data arrives", () => {
    expect(initialAnchorState().phase).toBe("idle");
    expect(initialAnchorState().phase).not.toBe("anchored");
  });

  it("does nothing at all until data arrives — no positioning of an empty list", () => {
    const { state, effects } = run([size(0), scrolled(0)]);
    expect(effects).toEqual([null, null]);
    expect(state.phase).toBe("idle");
  });
});

describe("positioning", () => {
  it("asks to scroll to the end on the first content size after data", () => {
    const { state, effects } = run([data(), size(4000)]);
    expect(effects).toEqual([null, "scrollToEnd"]);
    expect(state.phase).toBe("positioning");
  });

  it("re-issues the scroll on every growth — each batch moves the end down", () => {
    const { effects } = run([data(), size(1200), size(2600), size(4000)]);
    expect(effects).toEqual([null, "scrollToEnd", "scrollToEnd", "scrollToEnd"]);
  });

  it("stays hidden through all of that growth", () => {
    const { state } = run([data(), size(1200), size(2600), size(4000)]);
    expect(state.phase).toBe("positioning");
  });

  it("ignores a zero-height measurement rather than treating it as settled", () => {
    const { state, effects } = run([data(), size(0), size(0)]);
    expect(effects).toEqual([null, null, null]);
    expect(state.phase).toBe("positioning");
  });
});

describe("reveal — the offset, not the height", () => {
  /**
   * The regression a simulator recording caught: with 200 messages the thread
   * opened on 171-182. The height had settled and `scrollToEnd` had been
   * issued, but the offset had not moved. Height stability must NOT reveal.
   */
  it("does NOT reveal just because the content stopped growing", () => {
    const { state, effects } = run([layout(), data(), size(4000), size(4000)]);
    expect(effects).toEqual([null, null, "scrollToEnd", "scrollToEnd"]);
    expect(state.phase).toBe("positioning");
  });

  it("reveals when a following frame reports the offset at the end", () => {
    const { state, effects } = run([data(), size(4000), scrolled(0)]);
    expect(effects).toEqual([null, "scrollToEnd", "reveal"]);
    expect(state.phase).toBe("anchored");
  });

  it("accepts a sub-pixel residue at the end as being at the end", () => {
    const { state } = run([data(), size(4000), scrolled(0.5)]);
    expect(state.phase).toBe("anchored");
  });

  /**
   * Measured on a device: after a successful `scrollToEnd` the list reported
   * 13.99px from the end — the content container's own bottom padding. A
   * sub-pixel epsilon rejected that and every open fell through to the
   * fallback, correctly positioned but unrecognised.
   */
  it("accepts the list's own bottom padding as being at the end", () => {
    const { state } = run([data(), size(4000), scrolled(14)]);
    expect(state.phase).toBe("anchored");
  });

  it("does NOT reveal on a frame that is still short of the end", () => {
    const { state, effects } = run([data(), size(4000), scrolled(900)]);
    expect(effects).toEqual([null, "scrollToEnd", null]);
    expect(state.phase).toBe("positioning");
  });

  it("does not reveal on an at-the-end frame before anything was positioned", () => {
    const { state } = run([data(), scrolled(0)]);
    expect(state.phase).toBe("positioning");
  });
});

describe("the fallback — never leave the thread blank", () => {
  it("reveals from positioning when the measurement never settles", () => {
    const { state, effects } = run([data(), size(4000), fallback]);
    expect(effects).toEqual([null, "scrollToEnd", "reveal"]);
    expect(state.phase).toBe("anchored");
  });

  it("reveals even if no content size ever arrived", () => {
    const { state } = run([data(), fallback]);
    expect(state.phase).toBe("anchored");
  });

  it("reveals even if data never arrived", () => {
    const { state } = run([fallback]);
    expect(state.phase).toBe("anchored");
  });
});

describe("an empty thread", () => {
  it("is revealed immediately — there is nothing to anchor to", () => {
    const { state, effects } = run([data(0)]);
    expect(effects).toEqual(["reveal"]);
    expect(state.phase).toBe("anchored");
  });
});

describe("a thread that fits on screen", () => {
  /**
   * Short threads never scroll, so no scroll frame will ever arrive to confirm
   * the offset. Without this the reveal would always wait for the fallback —
   * a placeholder held in front of a two-message conversation for no reason.
   */
  it("is revealed as soon as the content is known to fit the viewport", () => {
    const { state, effects } = run([layout(600), data(2), size(300)]);
    expect(effects).toEqual([null, null, "reveal"]);
    expect(state.phase).toBe("anchored");
  });

  it("still positions and waits when the content is taller than the viewport", () => {
    const { state, effects } = run([layout(600), data(), size(900)]);
    expect(effects).toEqual([null, null, "scrollToEnd"]);
    expect(state.phase).toBe("positioning");
  });

  it("does not guess when the viewport height is not known yet", () => {
    const { state, effects } = run([data(2), size(300)]);
    expect(effects).toEqual([null, "scrollToEnd"]);
    expect(state.phase).toBe("positioning");
  });
});

describe("once anchored, the gate is out of the way", () => {
  it("never re-hides, and never re-issues a scroll, on later growth", () => {
    const anchored = run([data(), size(4000), scrolled(0)]).state;
    const { state, effects } = run([size(9000), scrolled(2000)], anchored);
    expect(effects).toEqual([null, null]);
    expect(state.phase).toBe("anchored");
  });

  it("does not re-reveal on a second fallback", () => {
    const anchored = run([data(), size(4000), scrolled(0)]).state;
    const { effects } = run([fallback], anchored);
    expect(effects).toEqual([null]);
  });
});

describe("changing conversation", () => {
  it("resets to hidden so the next thread is anchored before it is shown", () => {
    const anchored = run([data(), size(4000), scrolled(0)]).state;
    const { state, effects } = run([reset], anchored);
    expect(effects).toEqual([null]);
    expect(state.phase).toBe("idle");
  });

  it("anchors the next thread from scratch after a reset", () => {
    const anchored = run([data(), size(4000), scrolled(0)]).state;
    const after = run([reset], anchored).state;
    const { state, effects } = run([data(), size(2000), scrolled(0)], after);
    expect(effects).toEqual([null, "scrollToEnd", "reveal"]);
    expect(state.phase).toBe("anchored");
  });
});
