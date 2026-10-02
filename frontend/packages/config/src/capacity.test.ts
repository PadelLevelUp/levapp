import { describe, expect, it } from "vitest";
import { effectiveFilledSpots, effectiveFilledSpotsOf } from "./capacity";

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

describe("effectiveFilledSpotsOf (calendar.event-detail rule 5, B-240)", () => {
  // Saved roster: Ana declined, Bruno coming.
  const presences = [
    { playerId: 1, status: "absent" },
    { playerId: 2, status: null },
  ];

  it("counts the same as effectiveFilledSpots when the list and the presences agree", () => {
    expect(effectiveFilledSpotsOf([{ id: "1" }, { id: "2" }], presences)).toBe(1);
  });

  it("does not subtract a declined student who is no longer listed (an edit's unticked student)", () => {
    expect(effectiveFilledSpotsOf([{ id: "2" }], presences)).toBe(1);
  });

  it("a newly ticked student with no presence row fills a spot", () => {
    expect(effectiveFilledSpotsOf([{ id: "2" }, { id: "3" }], presences)).toBe(2);
  });

  it("matches ids across number and string", () => {
    expect(effectiveFilledSpotsOf([{ id: 2 }], [{ playerId: "2", status: "absent" }])).toBe(0);
  });
});
