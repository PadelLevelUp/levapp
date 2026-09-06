import { describe, expect, it } from "vitest";

import { formatImportTimestamp, formatInviteExpiry } from "./date-format";

// PAD-157: both formatters used to be `toLocaleDateString(undefined, …)`, i.e.
// the *device* locale. The regression they guard is invisible on a Portuguese
// phone and obvious in the normal case — a Portuguese coach whose phone is set
// to English — so every assertion below compares the two languages rather than
// trusting whatever locale the test runner happens to sit in.
//
// Dates are built with the local-time `Date` constructor and serialised, so the
// calendar day the formatter prints is the one asserted here in any timezone;
// `new Date("2026-09-05T…Z")` would drift a day west of Greenwich.

describe("formatImportTimestamp", () => {
  const iso = new Date(2026, 8, 5, 14, 30).toISOString(); // 5 September 2026, 14:30 local

  it("renders the month name in the app language, not the device's", () => {
    expect(formatImportTimestamp(iso, "pt")).toMatch(/set/i);
    expect(formatImportTimestamp(iso, "en")).toMatch(/Sep/);
    expect(formatImportTimestamp(iso, "pt")).not.toBe(formatImportTimestamp(iso, "en"));
  });

  it("never shows an English month when the app language is pt", () => {
    expect(formatImportTimestamp(iso, "pt")).not.toMatch(/Sep\b/);
  });

  it("keeps the time of day", () => {
    expect(formatImportTimestamp(iso, "pt")).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("formatInviteExpiry", () => {
  const iso = new Date(2026, 9, 12).toISOString(); // 12 October 2026, local

  it("orders the numeric date by the app language, not the device", () => {
    // pt is day-first, en-US is month-first — they can only differ if the
    // language argument is actually honoured.
    expect(formatInviteExpiry(iso, "pt")).toMatch(/^12\//);
    expect(formatInviteExpiry(iso, "en-US")).toMatch(/^10\//);
  });
});
