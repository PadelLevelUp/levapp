import { describe, expect, it } from "vitest";
import { manualInviteClosed } from "./manual-invite";

describe("manualInviteClosed", () => {
  it("closes the manual picker on a new-engine class only", () => {
    expect(manualInviteClosed("new")).toBe(true);
    expect(manualInviteClosed("old")).toBe(false);
    // An older server sends no engineVersion: today's buttons stay.
    expect(manualInviteClosed(undefined)).toBe(false);
    expect(manualInviteClosed(null)).toBe(false);
  });
});
