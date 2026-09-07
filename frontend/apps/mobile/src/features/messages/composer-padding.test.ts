import { describe, expect, it } from "vitest";

import { composerBottomPadding } from "./composer-padding";

/**
 * messaging.conversation-detail rule 13 — "Composer row is symmetric above the
 * keyboard". The row's own padding is 12pt on every side; this helper decides
 * only the extra inset under it.
 */
describe("composerBottomPadding", () => {
  it("adds nothing while the keyboard is open, whatever the safe-area inset", () => {
    expect(composerBottomPadding(true, 34)).toBe(0);
    expect(composerBottomPadding(true, 0)).toBe(0);
  });

  it("clears the home indicator by the safe-area inset while the keyboard is down", () => {
    expect(composerBottomPadding(false, 34)).toBe(34);
  });

  it("adds nothing on a device without a home indicator", () => {
    expect(composerBottomPadding(false, 0)).toBe(0);
  });
});
