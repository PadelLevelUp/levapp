/**
 * PAD-496: a dialog never grows past the part of the window it can be seen in. The overlay
 * centres its content, so a dialog taller than the window loses its title above the screen and
 * its footer below it, and neither can be reached.
 */
import { describe, expect, it } from "vitest";
import { DIALOG_WINDOW_MARGIN, dialogMaxHeight } from "./dialog-size";

describe("dialogMaxHeight", () => {
  it("leaves the safe areas and the overlay's margin free", () => {
    // iPhone 17 Pro: 874 pt, notch 62, home indicator 34.
    expect(dialogMaxHeight(874, { top: 62, bottom: 34 })).toBe(874 - 62 - 34 - DIALOG_WINDOW_MARGIN);
  });

  it("a short phone gets a shorter dialog, not a clipped one", () => {
    expect(dialogMaxHeight(568, { top: 20, bottom: 0 })).toBe(568 - 20 - DIALOG_WINDOW_MARGIN);
  });

  it("the keyboard, when it is up, is not dialog space", () => {
    expect(dialogMaxHeight(874, { top: 62, bottom: 34 }, 336)).toBe(874 - 62 - 336 - DIALOG_WINDOW_MARGIN);
  });

  it("never answers a height too small to show a header, one row and a footer", () => {
    expect(dialogMaxHeight(300, { top: 60, bottom: 40 }, 250)).toBe(240);
  });
});
