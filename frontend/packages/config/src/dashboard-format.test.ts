import { describe, expect, it } from "vitest";
import {
  greetingKey,
  longDate,
  parseISODate,
  shortDate,
  todayISO,
  weekdayLong,
  weekdayShort,
} from "./dashboard-format";

describe("todayISO", () => {
  it("uses the LOCAL date, not the UTC one", () => {
    // 00:30 local on the 9th in a UTC+1 zone is still the 8th in UTC. The
    // naive toISOString().slice(0,10) returns "2026-08-08" here, which is the
    // bug this exists to prevent.
    const justAfterLocalMidnight = new Date(2026, 7, 9, 0, 30, 0);
    expect(todayISO(justAfterLocalMidnight)).toBe("2026-08-09");
  });

  it("zero-pads month and day", () => {
    expect(todayISO(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("round-trips through parseISODate to the same calendar day", () => {
    const d = new Date(2026, 11, 31, 23, 59);
    const back = parseISODate(todayISO(d));
    expect([back.getFullYear(), back.getMonth(), back.getDate()]).toEqual([2026, 11, 31]);
  });
});

describe("parseISODate", () => {
  it("reads the string as local midnight, not UTC", () => {
    const d = parseISODate("2026-08-04");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 7, 4]);
    expect(d.getHours()).toBe(0);
  });
});

describe("greetingKey", () => {
  it.each([
    [0, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [18, "afternoon"],
    [19, "evening"],
    [23, "evening"],
  ])("hour %i -> %s", (hour, expected) => {
    expect(greetingKey(new Date(2026, 7, 4, hour as number))).toBe(expected);
  });
});

describe("locale-aware formatting", () => {
  it("renders pt rather than a translated-looking English string", () => {
    expect(longDate("2026-08-04", "pt")).toMatch(/agosto/);
    expect(longDate("2026-08-04", "en")).toMatch(/August/);
  });

  it("keeps the compact and column forms distinct", () => {
    expect(shortDate("2026-08-09", "en")).toMatch(/Aug/);
    // Uppercased, and pt's trailing period stripped ("dom." -> "DOM").
    const col = weekdayShort("2026-08-09", "pt");
    expect(col).toBe(col.toUpperCase());
    expect(col).not.toContain(".");
  });

  it("gives a full weekday for the hero eyebrow", () => {
    expect(weekdayLong("2026-08-09", "en")).toBe("Sunday");
  });
});
