import { describe, expect, it } from "vitest";
import { QUIET_HOURS_DEFAULT, QUIET_HOURS_STEPS, isValidQuietWindow, quietWindowOf } from "./quiet-hours";

/**
 * notifications.config rule 6a (PAD-451): the coach's quiet window, shared by web and iOS so the
 * two pickers offer the same choices and refuse the same windows the server refuses.
 */
describe("quiet hours (PAD-451)", () => {
  it("defaults to 22:00–07:00", () => {
    expect(QUIET_HOURS_DEFAULT).toEqual({ start: "22:00", end: "07:00" });
  });

  it("offers every half hour of the day, in order", () => {
    expect(QUIET_HOURS_STEPS).toHaveLength(48);
    expect(QUIET_HOURS_STEPS.slice(0, 3)).toEqual(["00:00", "00:30", "01:00"]);
    expect(QUIET_HOURS_STEPS.at(-1)).toBe("23:30");
  });

  it("accepts windows on the grid, crossing midnight or not", () => {
    expect(isValidQuietWindow("23:00", "08:00")).toBe(true);
    expect(isValidQuietWindow("13:00", "15:00")).toBe(true);
  });

  it("refuses an empty window and anything off the 30-minute grid", () => {
    expect(isValidQuietWindow("22:00", "22:00")).toBe(false);
    expect(isValidQuietWindow("22:15", "07:00")).toBe(false);
    expect(isValidQuietWindow("22:00", "25:00")).toBe(false);
    expect(isValidQuietWindow("10pm", "07:00")).toBe(false);
  });

  it("fills a missing bound with the default (an older server or config)", () => {
    expect(quietWindowOf({ start: "23:00", end: "08:00" })).toEqual({ start: "23:00", end: "08:00" });
    expect(quietWindowOf({})).toEqual({ start: "22:00", end: "07:00" });
    expect(quietWindowOf(null)).toEqual({ start: "22:00", end: "07:00" });
  });
});
