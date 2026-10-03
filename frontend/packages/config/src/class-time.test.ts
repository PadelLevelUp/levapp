import { describe, expect, it } from "vitest";
import { isHhMm } from "./class-time";

describe("isHhMm (B-275)", () => {
  it("takes every real HH:MM", () => {
    for (const v of ["00:00", "07:05", "12:30", "23:59"]) expect(isHhMm(v), v).toBe(true);
  });
  it("refuses what the native input can leave behind, and anything else", () => {
    for (const v of ["", "  ", "9", "9:30", "25:00", "09:60", "09:00:00", null, undefined, 930]) expect(isHhMm(v), String(v)).toBe(false);
  });
});
