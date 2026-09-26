import { describe, expect, it } from "vitest";
import { validationTier } from "./validation-tier";

/**
 * PAD-443 — attendance.validation rule 23: how loudly the Presences badge and the dashboard's
 * validation card show the number of classes still to validate. One helper, so web and iOS cannot
 * disagree on where "yellow" ends.
 *
 * Criterion: "The Presences badge is the dashboard's number, with its tier".
 */
describe("validationTier", () => {
  it("shows nothing when there is nothing to validate", () => {
    expect(validationTier(0)).toBe("none");
  });

  it("is yellow from 1 to 5", () => {
    expect(validationTier(1)).toBe("attention");
    expect(validationTier(5)).toBe("attention");
  });

  it("is red above 5", () => {
    expect(validationTier(6)).toBe("urgent");
    expect(validationTier(99)).toBe("urgent");
  });

  it("treats a missing or negative count as nothing", () => {
    expect(validationTier(-1)).toBe("none");
    expect(validationTier(Number.NaN)).toBe("none");
  });
});
