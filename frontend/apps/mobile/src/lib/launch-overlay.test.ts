import { describe, expect, it } from "vitest";
import { LAUNCH_RELEASE_GRACE_MS, overlayShouldRelease } from "./launch-overlay";

describe("the launch overlay's release (PAD-587)", () => {
  it("never releases before the fonts are ready, whatever the screen says", () => {
    expect(overlayShouldRelease({ fontsReady: false, firstScreenReadyAt: 0, now: 10_000 })).toBe(false);
  });

  it("waits for the first screen", () => {
    expect(overlayShouldRelease({ fontsReady: true, firstScreenReadyAt: null, now: 10_000 })).toBe(false);
  });

  it("releases a grace after the first screen is ready, not before", () => {
    const at = 1000;
    expect(overlayShouldRelease({ fontsReady: true, firstScreenReadyAt: at, now: at + LAUNCH_RELEASE_GRACE_MS - 1 })).toBe(false);
    expect(overlayShouldRelease({ fontsReady: true, firstScreenReadyAt: at, now: at + LAUNCH_RELEASE_GRACE_MS })).toBe(true);
  });

  it("the grace is short: a slow network, not the animation, is what the user waits for", () => {
    expect(LAUNCH_RELEASE_GRACE_MS).toBeLessThanOrEqual(500);
  });
});
