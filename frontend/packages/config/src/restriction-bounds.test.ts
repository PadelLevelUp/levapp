import { describe, expect, it } from "vitest";
import { RESTRICTION_BOUNDS, canStepRestriction, stepRestriction } from "./restriction-bounds";

/**
 * notifications.config rule 14 (PAD-433): the restriction steppers' bounds and steps live in
 * ONE place that web's RestrictionsPanel and the iOS restrictions section both read, so the
 * two clients cannot drift. The values are web's as they stood before PAD-433.
 */
describe("RESTRICTION_BOUNDS (PAD-433, notifications.config rule 14)", () => {
  it("pins web's bounds and steps for every stepper", () => {
    expect(RESTRICTION_BOUNDS).toEqual({
      maxSimultaneous: { min: 1, max: 20, step: 1 },
      maxTotal: { min: 1, max: 50, step: 1 },
      maxInactiveTime: { min: 15, max: 1440, step: 15 },
      minTimeBeforeClass: { min: 5, max: 240, step: 5 },
      maxInvitesPerStudentPerDay: { min: 1, max: 10, step: 1 },
      cancellationDeadlineHours: { min: 0, max: 168, step: 1 },
    });
  });
});

describe("stepRestriction — a step clamps at the shared bounds (PAD-433)", () => {
  it("steps by the key's step", () => {
    expect(stepRestriction("maxSimultaneous", 3, 1)).toBe(4);
    expect(stepRestriction("maxInactiveTime", 60, -1)).toBe(45);
    expect(stepRestriction("minTimeBeforeClass", 30, 1)).toBe(35);
  });

  it("stays at the bound instead of passing it", () => {
    expect(stepRestriction("maxSimultaneous", 20, 1)).toBe(20);
    expect(stepRestriction("maxInactiveTime", 15, -1)).toBe(15);
    expect(stepRestriction("cancellationDeadlineHours", 0, -1)).toBe(0);
    expect(stepRestriction("maxTotal", 50, 1)).toBe(50);
  });

  it("clamps a stored value that is off the step grid into range", () => {
    expect(stepRestriction("maxInactiveTime", 1435, 1)).toBe(1440);
    expect(stepRestriction("minTimeBeforeClass", 7, -1)).toBe(5);
  });
});

describe("canStepRestriction — the button at a bound is disabled (PAD-433)", () => {
  it("refuses a step past either bound and allows one inside", () => {
    expect(canStepRestriction("maxSimultaneous", 20, 1)).toBe(false);
    expect(canStepRestriction("maxSimultaneous", 20, -1)).toBe(true);
    expect(canStepRestriction("maxInactiveTime", 15, -1)).toBe(false);
    expect(canStepRestriction("cancellationDeadlineHours", 0, -1)).toBe(false);
    expect(canStepRestriction("cancellationDeadlineHours", 0, 1)).toBe(true);
  });
});
