import { describe, expect, it } from "vitest";
import { pendingAgeDays } from "./pending-age";

describe("pendingAgeDays", () => {
  it("[PLAYERS-LIST-18] whole club days, today, and unknown", () => {
    // 23:30 UTC on 9 July is 00:30 on 10 July in Lisbon (UTC+1): three club days to 13 July,
    // where a UTC-date count would say four.
    const now = new Date("2026-07-13T09:00:00Z");
    expect(pendingAgeDays("2026-07-09T23:30:00+00:00", now)).toBe(3);
    // Earlier the same club day reads "today".
    expect(pendingAgeDays("2026-07-13T00:10:00+00:00", now)).toBe(0);
    // No creation instant: no age, not a guess.
    expect(pendingAgeDays(null, now)).toBeNull();
    expect(pendingAgeDays(undefined, now)).toBeNull();
  });

  it("counts across a month and a year end", () => {
    expect(pendingAgeDays("2026-12-30T12:00:00+00:00", new Date("2027-01-02T12:00:00Z"))).toBe(3);
  });
});
