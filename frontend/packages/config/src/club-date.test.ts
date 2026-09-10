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
