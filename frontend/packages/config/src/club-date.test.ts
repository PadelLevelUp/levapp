import { describe, expect, it } from "vitest";
import * as config from "./index";

// B-060: the club's date is read off the Europe/Lisbon clock, whatever the
// device's zone. In summer, 23:30 UTC is already the next day in Lisbon.
describe("clubTodayISO", () => {
  it("is the Lisbon date: 23:30 UTC on 31 July is 1 August in summer", () => {
    expect(config.clubTodayISO(new Date(Date.UTC(2027, 6, 31, 23, 30)))).toBe("2027-08-01");
  });

  it("is still 31 January in winter, when Lisbon is UTC", () => {
    expect(config.clubTodayISO(new Date(Date.UTC(2027, 0, 31, 23, 30)))).toBe("2027-01-31");
  });
});

describe("clubTodayUtcDate", () => {
  it("anchors the club date at UTC midnight, for calendar arithmetic", () => {
    expect(config.clubTodayUtcDate(new Date(Date.UTC(2027, 6, 31, 23, 30))).toISOString()).toBe(
      "2027-08-01T00:00:00.000Z"
    );
  });
});

describe("localDateTime", () => {
  it("builds a local date-time from parts, never by parsing a string", () => {
    expect(config.localDateTime("2027-07-13", "10:05").getTime()).toBe(new Date(2027, 6, 13, 10, 5).getTime());
  });

  it("is Invalid Date for input it cannot read", () => {
    expect(Number.isNaN(config.localDateTime("nope", "10:00").getTime())).toBe(true);
  });
});

// PAD-295 / B-066: the clients' "now" for every wall-clock comparison is the club's
// clock, carried in a local Date so it compares with `localDateTime` digits.
describe("lisbonNow", () => {
  it("carries Lisbon's wall clock in local fields: 23:30:15 UTC on 31 July is 00:30:15 on 1 August", () => {
    const n = config.lisbonNow(new Date(Date.UTC(2027, 6, 31, 23, 30, 15)));
    expect([n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds()]).toEqual([
      2027, 7, 1, 0, 30, 15,
    ]);
  });

  it("is the UTC wall clock in winter", () => {
    const n = config.lisbonNow(new Date(Date.UTC(2027, 0, 31, 23, 30)));
    expect([n.getFullYear(), n.getMonth(), n.getDate(), n.getHours(), n.getMinutes()]).toEqual([2027, 0, 31, 23, 30]);
  });

  it("orders against localDateTime built from stored digits", () => {
    const now = config.lisbonNow(new Date(Date.UTC(2027, 6, 15, 9, 0))); // 10:00 in Lisbon
    expect(config.localDateTime("2027-07-15", "10:30") > now).toBe(true);
    expect(config.localDateTime("2027-07-15", "09:30") < now).toBe(true);
  });
});

describe("isClubToday", () => {
  it("matches the club's date, not the device's, at 23:30 UTC in summer", () => {
    const now = new Date(Date.UTC(2027, 6, 31, 23, 30));
    expect(config.isClubToday(new Date(2027, 7, 1), now)).toBe(true);
    expect(config.isClubToday(new Date(2027, 6, 31), now)).toBe(false);
  });
});

// PAD-295 review (G-1): comparisons run on UTC-anchored digits, which have no DST
// gaps on any device, so the order is always the digit order.
describe("lisbonNowMs / wallClockMs / wallClockISOMs", () => {
  it("lisbonNowMs is Lisbon's digits anchored at UTC: 01:30Z on 2027-03-28 is 02:30 WEST", () => {
    expect(config.lisbonNowMs(new Date(Date.UTC(2027, 2, 28, 1, 30)))).toBe(Date.UTC(2027, 2, 28, 2, 30));
  });

  it("wallClockMs anchors stored digits at UTC and is NaN for garbage", () => {
    expect(config.wallClockMs("2027-03-28", "03:15")).toBe(Date.UTC(2027, 2, 28, 3, 15));
    expect(Number.isNaN(config.wallClockMs("nope", "03:15"))).toBe(true);
    expect(Number.isNaN(config.wallClockMs("2027-03-28", ""))).toBe(true);
  });

  it("wallClockISOMs reads a naive server string as club digits, and an instant through Lisbon", () => {
    expect(config.wallClockISOMs("2027-07-15T10:30:00")).toBe(Date.UTC(2027, 6, 15, 10, 30));
    expect(config.wallClockISOMs("2027-07-15T10:30:00.123456")).toBe(Date.UTC(2027, 6, 15, 10, 30));
    // 09:30Z in July is 10:30 in Lisbon.
    expect(config.wallClockISOMs("2027-07-15T09:30:00Z")).toBe(Date.UTC(2027, 6, 15, 10, 30));
    expect(Number.isNaN(config.wallClockISOMs("soon"))).toBe(true);
  });
});
