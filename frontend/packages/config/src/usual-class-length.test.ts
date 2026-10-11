import { describe, expect, it } from "vitest";
import { endFromUsualLength, usualClassMinutes } from "./usual-class-length";

describe("usualClassMinutes (PAD-559, classes.create rule 8c)", () => {
  it("is the median class length, rounded to the quarter hour", () => {
    const events = [
      { type: "class", startTime: "18:00", endTime: "19:30" },
      { type: "class", startTime: "10:00", endTime: "11:30" },
      { type: "class", startTime: "09:00", endTime: "10:00" },
    ];
    expect(usualClassMinutes(events)).toBe(90);
  });
  it("ignores non-class events and malformed times, and rounds an even-count median", () => {
    const events = [
      { type: "blocker", startTime: "08:00", endTime: "12:00" },
      { type: "class", startTime: "18:00", endTime: "19:00" },
      { type: "class", startTime: "18:00", endTime: "19:10" },
      { type: "class", startTime: "x", endTime: "19:00" },
    ];
    expect(usualClassMinutes(events)).toBe(60); // median of 60 and 70 is 65 → 60
  });
  it("falls back to 60 with nothing to read", () => {
    expect(usualClassMinutes([])).toBe(60);
    expect(usualClassMinutes([{ type: "class", startTime: "19:00", endTime: "18:00" }])).toBe(60);
  });
  it("endFromUsualLength adds the length and never passes 23:59", () => {
    expect(endFromUsualLength("18:00", 90)).toBe("19:30");
    expect(endFromUsualLength("23:30", 60)).toBe("23:59");
    expect(endFromUsualLength("", 60)).toBe("");
  });
});
