import { describe, expect, it } from "vitest";
import * as ranges from "./dateRanges";

// B-060: the attendance presets and the Presences week are computed on the
// club's day (Europe/Lisbon), not the UTC day. In summer 23:30 UTC is already
// the next day in Lisbon; in winter Lisbon is UTC.
describe("presetRange uses the club's day (B-060)", () => {
  it("1m at 23:30 UTC on 31 July is August", () => {
    expect(ranges.presetRange("1m", new Date(Date.UTC(2027, 6, 31, 23, 30)))).toEqual({
      from: "2027-08-01",
      to: "2027-08-31",
    });
  });

  it("1m at 23:30 UTC on 31 January is still January", () => {
    expect(ranges.presetRange("1m", new Date(Date.UTC(2027, 0, 31, 23, 30)))).toEqual({
      from: "2027-01-01",
      to: "2027-01-31",
    });
  });

  it("1w at 23:30 UTC on Sunday 18 July is the next week", () => {
    expect(ranges.presetRange("1w", new Date(Date.UTC(2027, 6, 18, 23, 30)))).toEqual({
      from: "2027-07-19",
      to: "2027-07-25",
    });
  });
});

describe("weekBounds (B-060)", () => {
  it("is the club's week", () => {
    expect(ranges.weekBounds(0, new Date(Date.UTC(2027, 6, 18, 23, 30)))).toEqual({
      from: "2027-07-19",
      to: "2027-07-25",
    });
  });

  it("in winter, 23:30 UTC on Sunday 17 January is still that Sunday", () => {
    expect(ranges.weekBounds(0, new Date(Date.UTC(2027, 0, 17, 23, 30)))).toEqual({
      from: "2027-01-11",
      to: "2027-01-17",
    });
  });
});

import { weekBounds as wb, weekLabelDates } from "./dateRanges";

// PAD-295 review (G-2): the Presences week label must name the week `weekBounds`
// queried — both on the club's clock. 23:30Z on Sunday 13 Sep 2026 is already
// Monday the 14th in Lisbon.
describe("weekLabelDates agrees with weekBounds", () => {
  it("names the club's week, not the device's", () => {
    const now = new Date(Date.UTC(2026, 8, 13, 23, 30));
    const { monday, sunday } = weekLabelDates(0, now);
    expect(monday.toISOString().slice(0, 10)).toBe(wb(0, now).from);
    expect(sunday.toISOString().slice(0, 10)).toBe(wb(0, now).to);
    expect(monday.toISOString().slice(0, 10)).toBe("2026-09-14");
  });
});
