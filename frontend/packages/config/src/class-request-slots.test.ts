import { describe, expect, it } from "vitest";
import { hhmmOf, minutesOf, slotOptions, firstFreeDay, proposalAfterStartChange, requestMinutes } from "./class-request-slots";

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

describe("proposalAfterStartChange (PAD-491, classes.class-requests rule 20)", () => {
  it("moves the end with the start, keeping the form's duration", () => {
    expect(proposalAfterStartChange({ startTime: "10:00", endTime: "11:00" }, "14:30", 60)).toEqual({
      startTime: "14:30",
      endTime: "15:30",
    });
  });

  it("keeps a length the coach set by hand on the end", () => {
    expect(proposalAfterStartChange({ startTime: "10:00", endTime: "11:30" }, "12:00", 60)).toEqual({
      startTime: "12:00",
      endTime: "13:30",
    });
  });

  it("falls back to the request's own duration when the form's is not positive", () => {
    expect(proposalAfterStartChange({ startTime: "10:00", endTime: "09:00" }, "12:00", 90)).toEqual({
      startTime: "12:00",
      endTime: "13:30",
    });
  });

  it("never runs past 23:59", () => {
    expect(proposalAfterStartChange({ startTime: "10:00", endTime: "12:00" }, "23:00", 60)).toEqual({
      startTime: "23:00",
      endTime: "23:59",
    });
  });

  it("leaves the end alone while the start is not a time yet", () => {
    expect(proposalAfterStartChange({ startTime: "10:00", endTime: "11:00" }, "", 60)).toEqual({
      startTime: "",
      endTime: "11:00",
    });
  });
});

describe("requestMinutes", () => {
  it("is the request's own length", () => {
    expect(requestMinutes({ startTime: "10:00", endTime: "11:30" })).toBe(90);
  });
});
