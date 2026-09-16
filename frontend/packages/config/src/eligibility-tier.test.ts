import { describe, expect, it } from "vitest";
import { tierMode, tierValueFor } from "./eligibility-tier";

const level = { attribute: "level", operation: "same_as_class" };

// eligibility.cascade rule 2: [] and null are distinct on the wire
describe("tierMode", () => {
  it("maps null → standard, [] → everyone, a list → custom", () => {
    expect(tierMode(null)).toBe("standard");
    expect(tierMode(undefined)).toBe("standard");
    expect(tierMode([])).toBe("everyone");
    expect(tierMode([level])).toBe("custom");
  });
});

describe("tierValueFor", () => {
  it("clears the tier for standard and stores [] for everyone", () => {
    expect(tierValueFor("standard", [level], [level])).toBeNull();
    expect(tierValueFor("everyone", [level], [level])).toEqual([]);
  });
  it("custom keeps the current rules, else seeds from the effective bar, else empty", () => {
    expect(tierValueFor("custom", [level], null)).toEqual([level]);
    expect(tierValueFor("custom", null, [level])).toEqual([level]);
    expect(tierValueFor("custom", [], [level])).toEqual([level]);
    expect(tierValueFor("custom", null, null)).toEqual([]);
  });
});
