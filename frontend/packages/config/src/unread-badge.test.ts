import { describe, expect, it } from "vitest";
import { unreadBadgeLabel } from "./unread-badge";

describe("unreadBadgeLabel (PAD-414)", () => {
  it("reads the exact count for 1 through 9", () => {
    expect(unreadBadgeLabel(1)).toBe("1");
    expect(unreadBadgeLabel(3)).toBe("3");
    expect(unreadBadgeLabel(9)).toBe("9");
  });

  it("caps at 9+ above 9", () => {
    expect(unreadBadgeLabel(10)).toBe("9+");
    expect(unreadBadgeLabel(12)).toBe("9+");
    expect(unreadBadgeLabel(999)).toBe("9+");
  });

  it("is empty for zero or negative — nothing to show", () => {
    expect(unreadBadgeLabel(0)).toBe("");
    expect(unreadBadgeLabel(-1)).toBe("");
  });
});
