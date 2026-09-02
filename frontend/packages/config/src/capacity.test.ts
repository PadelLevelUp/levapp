import { describe, expect, it } from "vitest";
import { effectiveFilledSpots } from "./capacity";

describe("effectiveFilledSpots (PAD-71)", () => {
  it("subtracts declined students from the enrolment count", () => {
    // Ticket example: 6 enrolled, 3 declined -> 3 filled spots.
    const presences = [
      { status: "absent" },
      { status: "absent" },
      { status: "absent" },
      { status: null },
      { status: null },
      { status: null },
    ];
    expect(effectiveFilledSpots(6, presences)).toBe(3);
  });

  it("counts students who have not answered yet", () => {
    expect(effectiveFilledSpots(4, [])).toBe(4);
    expect(effectiveFilledSpots(4, undefined)).toBe(4);
    expect(effectiveFilledSpots(4, null)).toBe(4);
  });

  it("counts students marked present", () => {
    expect(
      effectiveFilledSpots(3, [
        { status: "present" },
        { status: "present" },
        { status: "present" },
      ])
    ).toBe(3);
  });

  it("never goes below zero", () => {
    expect(
      effectiveFilledSpots(1, [{ status: "absent" }, { status: "absent" }])
    ).toBe(0);
  });
});
