import { describe, expect, it } from "vitest";
import { LAUNCH_RELEASE_GRACE_MS, overlayMayRelease } from "./launch-overlay";

describe("the launch overlay's release (PAD-587, mobile.launch rule 2)", () => {
  it("never releases before the fonts are ready, whatever the screen says", () => {
    expect(overlayMayRelease({ fontsReady: false, firstScreenReady: true })).toBe(false);
  });

  it("waits for the first screen", () => {
    expect(overlayMayRelease({ fontsReady: true, firstScreenReady: false })).toBe(false);
  });

  it("releases once both hold (a font error counts as fonts ready at the call site)", () => {
    expect(overlayMayRelease({ fontsReady: true, firstScreenReady: true })).toBe(true);
  });

  it("the grace is short: a slow network, not the animation, is what the user waits for", () => {
    expect(LAUNCH_RELEASE_GRACE_MS).toBeLessThanOrEqual(500);
  });
});
