import { describe, expect, it } from "vitest";
import { hhmmOf, minutesOf, slotOptions } from "./class-request-slots";

describe("class-request slots (PAD-104)", () => {
  it("converts HH:MM both ways", () => {
    expect(minutesOf("08:30")).toBe(510);
    expect(hhmmOf(510)).toBe("08:30");
  });

  it("offers every start on the grid that still fits the class", () => {
    expect(slotOptions({ startTime: "11:00", endTime: "13:00" }, 60)).toEqual([
      { startTime: "11:00", endTime: "12:00" },
      { startTime: "11:30", endTime: "12:30" },
      { startTime: "12:00", endTime: "13:00" },
    ]);
  });

  it("offers nothing when the class does not fit", () => {
    expect(slotOptions({ startTime: "11:00", endTime: "11:45" }, 60)).toEqual([]);
  });
});
