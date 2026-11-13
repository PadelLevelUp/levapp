/**
 * PAD-496: a dialog never grows past the part of the window it can be seen in. The overlay
 * centres its content, so a dialog taller than the window loses its title above the screen and
 * its footer below it, and neither can be reached.
 */
import { describe, expect, it } from "vitest";
import { DIALOG_WINDOW_MARGIN, dialogMaxHeight } from "./dialog-size";

describe("dialogMaxHeight", () => {
  it("leaves the larger safe area free at both ends, and the overlay's margin", () => {
    // iPhone 17 Pro: 874 pt, notch 62, home indicator 34. The dialog is centred, so a
    // full-height one starts (874 - 734) / 2 = 70 pt down: below the 62 pt notch.
    expect(dialogMaxHeight(874, { top: 62, bottom: 34 })).toBe(874 - 2 * 62 - DIALOG_WINDOW_MARGIN);
  });

  it("the bottom safe area counts the same way when it is the larger one", () => {
    expect(dialogMaxHeight(800, { top: 24, bottom: 48 })).toBe(800 - 2 * 48 - DIALOG_WINDOW_MARGIN);
  });

  it("a short phone gets a shorter dialog, not a clipped one", () => {
    expect(dialogMaxHeight(568, { top: 20, bottom: 0 })).toBe(568 - 40 - DIALOG_WINDOW_MARGIN);
  });

  it("never answers a height too small to show a header, one row and a footer", () => {
    expect(dialogMaxHeight(300, { top: 60, bottom: 40 })).toBe(240);
  });

  it("[MOBILE-ANDROID-RUNTIME-21] with the keyboard up, fits the space above it", () => {
    // iPhone SE (3rd gen): 667 pt, status bar 20, no home indicator; keyboard with the
    // predictive bar covers 260 pt. Centred above it, the top inset is kept at both ends.
    expect(dialogMaxHeight(667, { top: 20, bottom: 0 }, 260)).toBe(667 - 260 - 2 * 20 - DIALOG_WINDOW_MARGIN);
    // iPhone 17 Pro Max: 956 pt, notch 62, home indicator 34 (under the keyboard), keyboard 336.
    expect(dialogMaxHeight(956, { top: 62, bottom: 34 }, 336)).toBe(956 - 336 - 2 * 62 - DIALOG_WINDOW_MARGIN);
  });
});
