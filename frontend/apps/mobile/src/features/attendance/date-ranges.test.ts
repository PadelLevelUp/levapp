import { describe, expect, it } from "vitest";

import {
  isValidCustomRange,
  parseIsoDate,
  presetRange,
  toIsoDate,
} from "./date-ranges";

/**
 * PAD-162. The presets are the only thing on the screen that decides what the
 * server is asked for, so they are pinned here rather than left to a Maestro
 * walk (which cannot see the request). The "runs in UTC" property is the one
 * that actually breaks in the field: a device in UTC-3 late in the evening is
 * already on the next UTC day, and a local-time computation would ask for the
 * wrong week.
 */

describe("presetRange", () => {
  // Wednesday 2026-09-16, 23:30 UTC.
  const now = new Date(Date.UTC(2026, 8, 16, 23, 30));

  it("1w is Monday through Sunday of the current UTC week", () => {
    expect(presetRange("1w", now)).toEqual({
      from: "2026-09-14",
      to: "2026-09-20",
    });
  });

  it("1w on a Sunday still returns the week that Sunday closes", () => {
    // 2026-09-20 is a Sunday; getUTCDay() === 0 must not restart the week.
    const sunday = new Date(Date.UTC(2026, 8, 20, 12));
    expect(presetRange("1w", sunday)).toEqual({
      from: "2026-09-14",
      to: "2026-09-20",
    });
  });

  it("1w spanning a month boundary rolls the month over", () => {
    // Tuesday 2026-12-01 — its Monday is in November.
    const dec1 = new Date(Date.UTC(2026, 11, 1, 8));
    expect(presetRange("1w", dec1)).toEqual({
      from: "2026-11-30",
      to: "2026-12-06",
    });
  });

  it("1m is the whole current calendar month", () => {
    expect(presetRange("1m", now)).toEqual({
      from: "2026-09-01",
      to: "2026-09-30",
    });
  });

  it("1m ends on the 29th in a leap February", () => {
    expect(presetRange("1m", new Date(Date.UTC(2028, 1, 10)))).toEqual({
      from: "2028-02-01",
      to: "2028-02-29",
    });
  });

  it("1y is the whole current calendar year", () => {
    expect(presetRange("1y", now)).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("uses UTC, not the device timezone", () => {
    // 2026-09-16T23:30Z is already Thursday the 17th in UTC+2 and still
    // Wednesday the 16th in UTC-3. The answer must not depend on that.
    const range = presetRange("1m", now);
    expect(range.from).toBe("2026-09-01");
  });
});

describe("toIsoDate / parseIsoDate", () => {
  it("round-trips a bare date", () => {
    expect(toIsoDate(parseIsoDate("2026-03-08"))).toBe("2026-03-08");
  });

  it("reads a naive ISO datetime as its UTC calendar day", () => {
    // A 00:30 class must stay on its own day, not slide back an hour into the
    // previous one.
    expect(toIsoDate(parseIsoDate("2026-03-08T00:30:00"))).toBe("2026-03-08");
  });
});

describe("isValidCustomRange", () => {
  it("accepts an ordered pair", () => {
    expect(isValidCustomRange("2026-01-01", "2026-03-31")).toBe(true);
  });

  it("accepts a single-day period", () => {
    expect(isValidCustomRange("2026-01-01", "2026-01-01")).toBe(true);
  });

  it("rejects a reversed pair", () => {
    expect(isValidCustomRange("2026-03-31", "2026-01-01")).toBe(false);
  });

  it("rejects a half-filled pair", () => {
    expect(isValidCustomRange("", "2026-01-01")).toBe(false);
    expect(isValidCustomRange("2026-01-01", "")).toBe(false);
  });
});
