import { describe, expect, it } from "vitest";
import { hhmmOf, minutesOf, slotOptions, firstFreeDay } from "./class-request-slots";

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

describe("firstFreeDay (classes.class-requests rule 11, PAD-302)", () => {
  const b = (date: string) => ({ date, startTime: "10:00", endTime: "12:00" });

  it("is today when today still has a block", () => {
    expect(firstFreeDay([b("2026-09-12"), b("2026-09-11")], "2026-09-11")).toBe("2026-09-11");
  });

  it("is the earliest later day with a block when today has none", () => {
    expect(firstFreeDay([b("2026-09-14"), b("2026-09-13")], "2026-09-11")).toBe("2026-09-13");
  });

  it("ignores blocks in the past and falls back to today when nothing is free", () => {
    expect(firstFreeDay([b("2026-09-10")], "2026-09-11")).toBe("2026-09-11");
    expect(firstFreeDay([], "2026-09-11")).toBe("2026-09-11");
  });
});
