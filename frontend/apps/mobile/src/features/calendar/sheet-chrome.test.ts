import { describe, expect, it } from "vitest";
import { SHEET_COLLAPSED_HEIGHT, SHEET_HANDLE_HEIGHT } from "@levelup/config";
import { SHEET_SHADOW, SHEET_TOP_RADIUS } from "./sheet-chrome";

/**
 * PAD-286 / B-065 — calendar.mobile-views rule 3 on iOS. The mobile unit runner
 * cannot render components, so the sheet's chrome lives in this plain module and
 * the numbers are pinned here; the simulator screenshot is the visual evidence.
 * Web's sheet: `rounded-t-[20px]` and `shadow-[0_-10px_24px_rgba(11,21,36,0.14)]`.
 */
describe("day sheet chrome (iOS parity with web)", () => {
  it("rounds the top corners by 20pt", () => {
    expect(SHEET_TOP_RADIUS).toBe(20);
  });

  it("casts the shadow upward, navy at 14%, like web's 0 -10px 24px", () => {
    expect(SHEET_SHADOW.shadowOffset.width).toBe(0);
    expect(SHEET_SHADOW.shadowOffset.height).toBe(-10);
    expect(SHEET_SHADOW.shadowColor).toBe("#0B1524");
    expect(SHEET_SHADOW.shadowOpacity).toBeCloseTo(0.14, 5);
    // CSS blur 24px ≈ a Core Animation shadowRadius of half that.
    expect(SHEET_SHADOW.shadowRadius).toBe(12);
  });

  it("gives the handle a 28pt row and derives the collapsed height from it", () => {
    expect(SHEET_HANDLE_HEIGHT).toBeGreaterThanOrEqual(28);
    expect(SHEET_COLLAPSED_HEIGHT).toBe(SHEET_HANDLE_HEIGHT + 76);
  });
});

// PAD-298 — mobile.android-runtime rule 1, criterion "The day sheet has depth on
// Android": Android ignores the iOS shadow props, so `elevation` sits beside them.
describe("day sheet chrome on Android (PAD-298)", () => {
  it("carries an elevation of at least 8 beside the iOS shadow props", () => {
    expect((SHEET_SHADOW as { elevation?: number }).elevation).toBeGreaterThanOrEqual(8);
  });
});
