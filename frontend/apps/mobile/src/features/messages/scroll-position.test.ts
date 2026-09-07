import { describe, expect, it } from "vitest";

import { isAtBottomOf, isAtTopOf, type ScrollMetrics } from "./scroll-position";

/**
 * PAD-208 / B-027 — the predicate that replaced the unconditional `scrollToEnd`
 * on the conversation `FlatList` (messaging.conversation-detail rules 10, 11).
 *
 * The screen itself is Maestro's job (there is no component renderer here), but
 * the decision the screen makes on every scroll event is a pure function, and
 * getting its mapping from React Native's event shape wrong — swapping
 * `contentSize` for `layoutMeasurement`, say — reinstates the bug silently.
 */

function metrics(
  offsetY: number,
  viewport: number,
  content: number
): ScrollMetrics {
  return {
    contentOffset: { y: offsetY },
    layoutMeasurement: { height: viewport },
    contentSize: { height: content },
  };
}

describe("isAtBottomOf", () => {
  it("is true at the very end of the thread", () => {
    expect(isAtBottomOf(metrics(1400, 600, 2000))).toBe(true);
  });

  it("is true within a bubble of the end, so an arrival still pins", () => {
    expect(isAtBottomOf(metrics(1350, 600, 2000))).toBe(true);
  });

  it("is FALSE once the reader has scrolled up — the whole point of B-027", () => {
    expect(isAtBottomOf(metrics(400, 600, 2000))).toBe(false);
  });

  it("is false one page up, not merely at the extreme top", () => {
    expect(isAtBottomOf(metrics(700, 600, 2000))).toBe(false);
  });

  it("is true for a thread that does not fill the screen", () => {
    expect(isAtBottomOf(metrics(0, 600, 300))).toBe(true);
  });
});

describe("isAtTopOf", () => {
  it("is true at the top of the loaded page, where the next page is fetched", () => {
    expect(isAtTopOf(metrics(0, 600, 2000))).toBe(true);
  });

  it("is false in the middle of the loaded page", () => {
    expect(isAtTopOf(metrics(700, 600, 2000))).toBe(false);
  });

  it("is false at the bottom", () => {
    expect(isAtTopOf(metrics(1400, 600, 2000))).toBe(false);
  });
});
