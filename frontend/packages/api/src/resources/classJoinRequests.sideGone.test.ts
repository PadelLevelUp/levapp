// PAD-808 (classes.join-requests rule 7a): the side part of an accept's `409 ineligible`.
import { describe, expect, it } from "vitest";
import { sideGoneOf } from "./classJoinRequests";

describe("sideGoneOf", () => {
  it("returns the side asked for when the side part applies", () => {
    expect(sideGoneOf({ code: "ineligible", reasons: ["side"], requestedSide: "left", openSides: ["right"] })).toBe("left");
    expect(sideGoneOf({ code: "ineligible", reasons: ["eligibility", "side"], requestedSide: "right" })).toBe("right");
  });

  it("is null for the bar alone, an older server's 409 without reasons, or no refusal", () => {
    expect(sideGoneOf({ code: "ineligible", reasons: ["eligibility"], ineligible: [] })).toBeNull();
    expect(sideGoneOf({ code: "ineligible", ineligible: [] })).toBeNull();
    expect(sideGoneOf(null)).toBeNull();
  });
});
